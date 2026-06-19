import { tx } from "../db";
import type { PoolClient } from "pg";
import { computeWriteMode } from "../domain/mode";
import type { ReportStatus } from "../domain/status";

// v2 단일목록 모델 mutation. 잠금은 보고서 status 기반(섹션 JOIN 없음).
const WORK_STATUSES = ["미작성", "작성중", "계획제출"]; // 업무 추가/마감 가능
const SUBMITTED = ["검수대기", "승인", "제출완료", "재제출"]; // 읽기 전용
const VAC_REQUIRED = ["병가", "휴직", "기타"]; // 사유 필수 유형

async function loadStatus(c: PoolClient, reportId: number): Promise<ReportStatus> {
  const r = await c.query<{ status: ReportStatus }>(
    `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
    [reportId],
  );
  if (!r.rows[0]) throw new Error("NOT_FOUND");
  return r.rows[0].status;
}

/**
 * 업무 행이 (지금) 작성자 편집 가능한지.
 *  - work status(미작성/작성중/계획제출): 자유 편집
 *  - 반려: 미해소 반려 행(reject_state='반려')만 편집(나머지 LOCKED_TASK)
 *  - 그 외(검수대기/승인/제출완료/재제출): 잠금
 */
function assertRowEditable(status: ReportStatus, rejectState: string | null) {
  if (WORK_STATUSES.includes(status)) return;
  if (status === "반려" && rejectState === "반려") return;
  throw new Error("LOCKED_TASK");
}

/** 행 마감/수정 시 미해소 반려를 자동 해소(D3: 계획제출·반려 재마감 시 resolved). */
async function resolveRowReject(c: PoolClient, taskId: number) {
  await c.query(
    `UPDATE task_rejections SET resolved_at=now() WHERE task_id=$1 AND resolved_at IS NULL`,
    [taskId],
  );
  await c.query(`UPDATE tasks SET reject_state=NULL WHERE id=$1 AND reject_state='반려'`, [taskId]);
}

export interface AddTaskInput {
  title: string;
  project?: string | null;
  plannedStart?: string | null;
  plannedDurationMin?: number | null;
  isNight?: boolean;
}

/** 오늘 할 일에 업무 추가(단일목록, section_id=NULL). sort_order는 report 단위 채번. */
export async function addTask(reportId: number, input: AddTaskInput): Promise<{ id: number }> {
  if (!input.title?.trim()) throw new Error("TITLE_REQUIRED");
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    // 추가는 작성 가능 status에서만(반려/제출이후 추가 불가 — 반려는 기존 행 수정만)
    if (!WORK_STATUSES.includes(status)) throw new Error("LOCKED_TASK");

    const ord = await c.query<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM tasks WHERE report_id=$1`,
      [reportId],
    );
    const r = await c.query<{ id: number }>(
      `INSERT INTO tasks(report_id, section_id, project, title, planned_start, planned_duration_min, status, sort_order, is_night)
       VALUES ($1,NULL,$2,$3,$4,$5,'계획',$6,$7) RETURNING id`,
      [
        reportId,
        input.project?.trim() || null,
        input.title.trim(),
        input.plannedStart || null,
        input.plannedDurationMin ?? null,
        ord.rows[0].n,
        !!input.isNight,
      ],
    );
    await touch(c, reportId);
    return { id: r.rows[0].id };
  });
}

/**
 * 업무 마감(완결/지연). 완료시각으로 오전·오후·야간 자동분류.
 * - doneTime('HH:MM' KST) 주면 그 시각, 없으면 now(). is_night = 마감 KST 시 ≥ 20.
 * - holdReason 있으면 '지연', 없으면 '완결'.
 */
export async function closeTask(
  reportId: number,
  taskId: number,
  opts?: { doneTime?: string | null; holdReason?: string | null },
): Promise<void> {
  const doneTime = opts?.doneTime?.trim() || null;
  // 시:분 범위까지 검증(24:00·19:99 등 ::time 캐스트 500 방지)
  if (doneTime && !/^([01]?\d|2[0-3]):[0-5]\d$/.test(doneTime)) throw new Error("BAD_TIME");
  const holdReason = opts?.holdReason?.trim() || null;
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    const t = await c.query<{ reject_state: string | null }>(
      `SELECT reject_state FROM tasks WHERE id=$1 AND report_id=$2`,
      [taskId, reportId],
    );
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    assertRowEditable(status, t.rows[0].reject_state);
    await c.query(
      `WITH ca AS (
         SELECT CASE WHEN $3::text IS NOT NULL
                     THEN (r.report_date + $3::time) AT TIME ZONE 'Asia/Seoul'
                     ELSE now() END AS ts,
                r.night_has
           FROM daily_reports r WHERE r.id=$2
       )
       UPDATE tasks SET
         status = (CASE WHEN $4::text IS NOT NULL THEN '지연' ELSE '완결' END)::task_status,
         hold_reason = $4,
         completed_at = (SELECT ts FROM ca),
         -- 야간 토글(night_has)이 켜져 있고 마감 KST 시 ≥20일 때만 야간(C1). 토글 off면 오전/오후로 분류돼 사라지지 않음.
         is_night = ((SELECT night_has FROM ca) AND EXTRACT(HOUR FROM (SELECT ts FROM ca) AT TIME ZONE 'Asia/Seoul') >= 20),
         updated_at = now()
       WHERE id=$1 AND report_id=$2`,
      [taskId, reportId, doneTime, holdReason],
    );
    await resolveRowReject(c, taskId);
    await touch(c, reportId);
  });
}

/** 마감 취소: 다시 '진행중' 할 일로. completed_at/is_night 초기화. */
export async function reopenTask(reportId: number, taskId: number): Promise<void> {
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    const t = await c.query<{ reject_state: string | null }>(
      `SELECT reject_state FROM tasks WHERE id=$1 AND report_id=$2`,
      [taskId, reportId],
    );
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    assertRowEditable(status, t.rows[0].reject_state);
    await c.query(
      `UPDATE tasks SET status='진행중', completed_at=NULL, is_night=false, hold_reason=NULL, updated_at=now()
         WHERE id=$1 AND report_id=$2`,
      [taskId, reportId],
    );
    await touch(c, reportId);
  });
}

/** 업무 상태/지연사유/실제소요 갱신 */
export async function updateTask(
  reportId: number,
  taskId: number,
  patch: { status?: string; holdReason?: string | null; actualMin?: number | null },
): Promise<void> {
  // 완결/지연 전이는 completed_at 정합(CHECK)이 필요 → closeTask/reopenTask 전용. 여기선 미완 상태만 허용.
  if (patch.status != null && patch.status !== "계획" && patch.status !== "진행중")
    throw new Error("BAD_STATUS");
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    const t = await c.query<{ reject_state: string | null }>(
      `SELECT reject_state FROM tasks WHERE id=$1 AND report_id=$2`,
      [taskId, reportId],
    );
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    assertRowEditable(status, t.rows[0].reject_state);
    await c.query(
      `UPDATE tasks SET status=COALESCE($3,status), hold_reason=$4,
              actual_duration_min=COALESCE($5,actual_duration_min), updated_at=now()
         WHERE id=$1 AND report_id=$2`,
      [taskId, reportId, patch.status ?? null, patch.holdReason ?? null, patch.actualMin ?? null],
    );
    await touch(c, reportId);
  });
}

export interface AdvanceInput {
  nightBranch?: "yes" | "no" | null;
  nightReason?: string | null;
  dailyComment?: string | null;
  noCommunication?: boolean;
  vacationType?: string | null;
  vacationComment?: string | null;
  carryover?: boolean; // 제출 시 미완료 업무를 내일로 이월
  expectedStatus?: string; // 낙관적 동시성: 클라이언트가 본 status. 불일치 시 거부(2단계 건너뛰기 방지)
}

/**
 * 제출 버튼(2단계 C2):
 *  - work + 미작성/작성중 → 계획제출(plan_submitted_at) — 검수자 개별 검토 가능해짐
 *  - work + 계획제출 → 검수대기(최종 제출)
 *  - rejected → 검수대기(재제출)
 *  - vacation → 검수대기(B3, 사유 필수 검증)
 */
export async function advanceReport(
  reportId: number,
  input: AdvanceInput,
): Promise<{ mode: string; status: ReportStatus; submitted: boolean }> {
  return tx(async (c) => {
    const cur = await c.query<{
      user_id: number;
      status: ReportStatus;
      is_vacation: boolean;
    }>(`SELECT user_id, status, is_vacation FROM daily_reports WHERE id=$1 FOR UPDATE`, [reportId]);
    if (!cur.rows[0]) throw new Error("NOT_FOUND");
    const { user_id, status } = cur.rows[0];

    // 낙관적 동시성: 두 번 클릭/두 탭이 2단계를 한 번에 건너뛰지 않도록 기대 status 일치 요구
    if (input.expectedStatus && input.expectedStatus !== status) throw new Error("STALE_STATE");

    const wantVacation = !!input.vacationType;
    // 휴가 전환 가드(B3 화이트리스트): 미작성/작성중/계획제출에서만 휴가로 마감 허용
    if (wantVacation && !WORK_STATUSES.includes(status)) throw new Error("VACATION_NOT_ALLOWED");

    const isVac = cur.rows[0].is_vacation || wantVacation;
    const mode = computeWriteMode(status, isVac);

    if (mode === "view") return { mode, status, submitted: false };

    // 공통 필드 저장(편집 가능 모드)
    if (input.dailyComment !== undefined)
      await c.query(`UPDATE daily_reports SET daily_comment=$2, updated_at=now() WHERE id=$1`, [
        reportId,
        input.dailyComment,
      ]);
    if (input.noCommunication !== undefined)
      await c.query(`UPDATE daily_reports SET no_communication=$2 WHERE id=$1`, [
        reportId,
        input.noCommunication,
      ]);
    if (input.nightBranch !== undefined) {
      const on = input.nightBranch === "yes";
      if (on && !input.nightReason?.trim()) throw new Error("NIGHT_REASON_REQUIRED");
      await c.query(
        `UPDATE daily_reports SET night_has=$2, night_reason=$3, updated_at=now() WHERE id=$1`,
        [reportId, on, on ? input.nightReason!.trim() : null],
      );
    }

    const submit = async (eventKind: "submitted" | "resubmitted") => {
      await c.query(
        `UPDATE daily_reports SET status='검수대기', submitted_at=now(), updated_at=now() WHERE id=$1`,
        [reportId],
      );
      await c.query(`INSERT INTO report_events(report_id, kind, actor_user_id) VALUES ($1,$2,$3)`, [
        reportId,
        eventKind,
        user_id,
      ]);
      if (input.carryover) await carryoverToNext(c, reportId, user_id);
    };

    if (mode === "vacation") {
      const comment = input.vacationComment?.trim() || null;
      if (comment && comment.length > 10000) throw new Error("REASON_TOO_LONG");
      // 유효(저장 후) 값 기준으로 필수사유 검증 — DB CHECK 500 방지(저장된 빈 사유 재제출 케이스)
      const prev = await c.query<{ vacation_type: string | null; vacation_comment: string | null }>(
        `SELECT vacation_type, vacation_comment FROM daily_reports WHERE id=$1`,
        [reportId],
      );
      const effType = input.vacationType ?? prev.rows[0]?.vacation_type ?? null;
      const effComment = comment ?? prev.rows[0]?.vacation_comment ?? null;
      if (effType && VAC_REQUIRED.includes(effType) && !effComment?.trim())
        throw new Error("VACATION_REASON_REQUIRED");
      await c.query(
        `UPDATE daily_reports SET is_vacation=true,
                vacation_type=COALESCE($2, vacation_type),
                vacation_comment=COALESCE($3, vacation_comment), updated_at=now()
           WHERE id=$1`,
        [reportId, input.vacationType ?? null, comment],
      );
      await submit("submitted");
      return { mode, status: "검수대기", submitted: true };
    }

    if (mode === "rejected") {
      // 재제출: 미해소 행 반려 해소(P5 task_rejections) + 행 표시 초기화
      await c.query(
        `UPDATE task_rejections SET resolved_at=now()
           WHERE report_id=$1 AND resolved_at IS NULL`,
        [reportId],
      );
      await c.query(`UPDATE tasks SET reject_state=NULL WHERE report_id=$1`, [reportId]);
      await submit("resubmitted");
      return { mode, status: "검수대기", submitted: true };
    }

    // mode === 'work'
    if (status === "계획제출") {
      await submit("submitted"); // 최종 제출
      return { mode, status: "검수대기", submitted: true };
    }
    // 1차: 계획 제출 — 빈 계획(업무 0건) 제출 차단(검수 큐 노이즈 방지)
    const cnt = await c.query<{ n: string }>(`SELECT count(*) AS n FROM tasks WHERE report_id=$1`, [reportId]);
    if (Number(cnt.rows[0].n) === 0) throw new Error("EMPTY_PLAN");
    await c.query(
      `UPDATE daily_reports SET status='계획제출', plan_submitted_at=now(),
              is_vacation=false, updated_at=now() WHERE id=$1`,
      [reportId],
    );
    return { mode, status: "계획제출", submitted: false };
  });
}

/** 제출 시 미완료(완결/지연 아님) 업무를 다음 영업일 보고서로 이월(없으면 생성). 단일목록. */
async function carryoverToNext(c: PoolClient, reportId: number, userId: number) {
  const rep = await c.query<{ report_date: string }>(
    `SELECT to_char(report_date,'YYYY-MM-DD') AS report_date FROM daily_reports WHERE id=$1`,
    [reportId],
  );
  const date = rep.rows[0]?.report_date;
  if (!date) return;
  const incomplete = await c.query<{ project: string | null; title: string; id: number }>(
    `SELECT id, project, title FROM tasks
       WHERE report_id=$1 AND status NOT IN ('완결','지연') ORDER BY sort_order, id`,
    [reportId],
  );
  if (incomplete.rows.length === 0) return;
  // 차기 보고서가 이미 있고 '작성 가능 status'일 때만 이월(제출/승인된 미래 보고서 오염 방지). 행 잠금.
  const next = await c.query<{ id: number; status: ReportStatus }>(
    `SELECT id, status FROM daily_reports WHERE user_id=$1 AND report_date > $2
       ORDER BY report_date ASC LIMIT 1 FOR UPDATE`,
    [userId, date],
  );
  if (!next.rows[0]) return; // 차기 보고서 없으면 스킵(작성 시 '어제 미완료 불러오기'로 회수)
  if (!WORK_STATUSES.includes(next.rows[0].status)) return; // 제출/승인/반려된 차기 보고서엔 주입 금지
  const nextId = next.rows[0].id;
  let base = (
    await c.query<{ n: number }>(`SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM tasks WHERE report_id=$1`, [
      nextId,
    ])
  ).rows[0].n;
  for (const t of incomplete.rows) {
    // 멱등: 같은 원본(carried_from)이 이미 이월돼 있으면 스킵(제목 충돌 대신 출처 기준)
    const dup = await c.query(`SELECT 1 FROM tasks WHERE report_id=$1 AND carried_from_task_id=$2`, [nextId, t.id]);
    if (dup.rows[0]) continue;
    await c.query(
      `INSERT INTO tasks(report_id, section_id, project, title, status, sort_order, carried_from_task_id)
       VALUES ($1,NULL,$2,$3,'계획',$4,$5)`,
      [nextId, t.project, t.title, base++, t.id],
    );
  }
}

/** 직전 보고서의 미완료 업무를 오늘 할 일로 이월(단일목록) */
export async function carryoverIncomplete(reportId: number): Promise<{ count: number }> {
  return tx(async (c) => {
    const rep = await c.query<{ user_id: number; report_date: string; status: ReportStatus }>(
      `SELECT user_id, to_char(report_date,'YYYY-MM-DD') AS report_date, status
         FROM daily_reports WHERE id=$1 FOR UPDATE`,
      [reportId],
    );
    const r = rep.rows[0];
    if (!r) throw new Error("NOT_FOUND");
    if (!WORK_STATUSES.includes(r.status)) throw new Error("LOCKED");

    const prior = await c.query<{ id: number }>(
      `SELECT id FROM daily_reports WHERE user_id=$1 AND report_date < $2
        ORDER BY report_date DESC LIMIT 1`,
      [r.user_id, r.report_date],
    );
    if (!prior.rows[0]) return { count: 0 };

    const tasks = await c.query<{ id: number; project: string | null; title: string }>(
      `SELECT id, project, title FROM tasks WHERE report_id=$1 AND status <> '완결' ORDER BY sort_order, id`,
      [prior.rows[0].id],
    );
    let base = (
      await c.query<{ n: number }>(`SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM tasks WHERE report_id=$1`, [
        reportId,
      ])
    ).rows[0].n;

    let count = 0;
    for (const t of tasks.rows) {
      const dup = await c.query(`SELECT 1 FROM tasks WHERE report_id=$1 AND title=$2`, [reportId, t.title]);
      if (dup.rows[0]) continue;
      await c.query(
        `INSERT INTO tasks(report_id, section_id, project, title, status, sort_order, carried_from_task_id)
         VALUES ($1,NULL,$2,$3,'계획',$4,$5)`,
        [reportId, t.project, t.title, base++, t.id],
      );
      count++;
    }
    await touch(c, reportId);
    return { count };
  });
}

/** 커뮤니케이션 기록 추가 (제출 전 보고서에만) */
export async function addCommunication(
  reportId: number,
  input: { type: string; counterpart: string; time?: string | null; summary: string },
): Promise<{ id: number }> {
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    if (SUBMITTED.includes(status)) throw new Error("LOCKED_SECTION");
    const r = await c.query<{ id: number }>(
      `INSERT INTO communications(report_id, comm_type, counterpart, occurred_at, summary)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [reportId, input.type, input.counterpart, input.time ?? null, input.summary],
    );
    await c.query(`UPDATE daily_reports SET no_communication=false WHERE id=$1`, [reportId]);
    await touch(c, reportId);
    return { id: r.rows[0].id };
  });
}

/** 임시저장: 제출/전이 없이 일일코멘트·야간사유·커뮤없음·야간토글만 저장 (제출 전 보고서에만) */
export async function saveDraft(
  reportId: number,
  input: {
    dailyComment?: string | null;
    nightReason?: string | null;
    noCommunication?: boolean;
    nightHas?: boolean;
  },
): Promise<void> {
  return tx(async (c) => {
    const status = await loadStatus(c, reportId);
    if (SUBMITTED.includes(status)) throw new Error("LOCKED_SECTION");
    if (input.dailyComment !== undefined)
      await c.query(`UPDATE daily_reports SET daily_comment=$2, updated_at=now() WHERE id=$1`, [
        reportId,
        input.dailyComment,
      ]);
    if (input.nightReason !== undefined)
      await c.query(`UPDATE daily_reports SET night_reason=$2, updated_at=now() WHERE id=$1`, [
        reportId,
        input.nightReason,
      ]);
    if (input.nightHas !== undefined)
      await c.query(`UPDATE daily_reports SET night_has=$2, updated_at=now() WHERE id=$1`, [
        reportId,
        input.nightHas,
      ]);
    if (input.noCommunication !== undefined)
      await c.query(`UPDATE daily_reports SET no_communication=$2 WHERE id=$1`, [
        reportId,
        input.noCommunication,
      ]);
  });
}

async function touch(c: PoolClient, reportId: number) {
  await c.query(
    `UPDATE daily_reports SET status = CASE WHEN status='미작성' THEN '작성중' ELSE status END, updated_at=now() WHERE id=$1`,
    [reportId],
  );
}
