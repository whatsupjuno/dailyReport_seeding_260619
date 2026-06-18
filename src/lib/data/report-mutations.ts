import { tx } from "../db";
import type { PoolClient } from "pg";
import { computeWriteMode } from "../domain/mode";
import type { ReportStatus, SectionKind } from "../domain/status";

async function ensureSection(c: PoolClient, reportId: number, kind: SectionKind): Promise<number> {
  const ex = await c.query<{ id: number }>(
    `SELECT id FROM report_sections WHERE report_id = $1 AND kind = $2`,
    [reportId, kind],
  );
  if (ex.rows[0]) return ex.rows[0].id;
  const r = await c.query<{ id: number }>(
    `INSERT INTO report_sections(report_id, kind, status) VALUES ($1,$2,'작성중') RETURNING id`,
    [reportId, kind],
  );
  return r.rows[0].id;
}

async function lockSection(c: PoolClient, reportId: number, kind: SectionKind) {
  await c.query(
    `UPDATE report_sections SET status='마감완료', locked=true, closed_at=now()
       WHERE report_id=$1 AND kind=$2`,
    [reportId, kind],
  );
}

async function loadState(c: PoolClient, reportId: number) {
  const r = await c.query<{ user_id: number; status: ReportStatus; is_vacation: boolean }>(
    `SELECT user_id, status, is_vacation FROM daily_reports WHERE id=$1 FOR UPDATE`,
    [reportId],
  );
  const sec = await c.query<{ kind: SectionKind; status: string }>(
    `SELECT kind, status FROM report_sections WHERE report_id=$1`,
    [reportId],
  );
  const map: Partial<Record<SectionKind, string>> = {};
  for (const s of sec.rows) map[s.kind] = s.status;
  return { report: r.rows[0], secMap: map };
}

export interface AddTaskInput {
  sectionKind: SectionKind;
  title: string;
  project?: string | null;
  plannedStart?: string | null;
  plannedDurationMin?: number | null;
}

/** 편집 가능한(잠기지 않은) 섹션에만 업무 추가 */
export async function addTask(reportId: number, input: AddTaskInput): Promise<{ id: number }> {
  return tx(async (c) => {
    const rep = await c.query<{ status: string }>(
      `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
      [reportId],
    );
    const status = rep.rows[0]?.status;
    if (!status) throw new Error("NOT_FOUND");
    // 제출 이후(검수대기/승인/제출완료/재제출) 보고서엔 추가 불가
    if (status === "검수대기" || status === "승인" || status === "제출완료" || status === "재제출")
      throw new Error("LOCKED_SECTION");

    const sec = await c.query<{ id: number; locked: boolean; status: string }>(
      `SELECT id, locked, status FROM report_sections WHERE report_id=$1 AND kind=$2`,
      [reportId, input.sectionKind],
    );
    let sectionId = sec.rows[0]?.id;
    // 반려 사이클: '재작성'으로 지목된 기존 섹션에만 추가 가능(신규 섹션 생성 금지)
    if (status === "반려" && (!sectionId || sec.rows[0].status !== "재작성"))
      throw new Error("LOCKED_SECTION");
    if (!sectionId) sectionId = await ensureSection(c, reportId, input.sectionKind);
    else if (sec.rows[0].locked) throw new Error("LOCKED_SECTION");

    const ord = await c.query<{ n: number }>(
      `SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM tasks WHERE section_id=$1`,
      [sectionId],
    );
    const r = await c.query<{ id: number }>(
      `INSERT INTO tasks(report_id, section_id, project, title, planned_start, planned_duration_min, status, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,'계획',$7) RETURNING id`,
      [
        reportId,
        sectionId,
        input.project ?? null,
        input.title,
        input.plannedStart ?? null,
        input.plannedDurationMin ?? null,
        ord.rows[0].n,
      ],
    );
    await touch(c, reportId);
    return { id: r.rows[0].id };
  });
}

/** 업무 개별 마감(완결). 실제 소요시간 선택. */
export async function closeTask(
  reportId: number,
  taskId: number,
  actualMin?: number | null,
): Promise<void> {
  return tx(async (c) => {
    const t = await c.query<{ section_id: number; locked: boolean }>(
      `SELECT t.section_id, s.locked FROM tasks t JOIN report_sections s ON s.id=t.section_id
        WHERE t.id=$1 AND t.report_id=$2`,
      [taskId, reportId],
    );
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    if (t.rows[0].locked) throw new Error("LOCKED_SECTION");
    await c.query(`UPDATE tasks SET status='완결', actual_duration_min=COALESCE($2, actual_duration_min), updated_at=now() WHERE id=$1`, [
      taskId,
      actualMin ?? null,
    ]);
    await touch(c, reportId);
  });
}

/** 업무 상태 변경(진행중/지연 등) + 지연 사유 */
export async function updateTask(
  reportId: number,
  taskId: number,
  patch: { status?: string; holdReason?: string | null; actualMin?: number | null },
): Promise<void> {
  return tx(async (c) => {
    const t = await c.query<{ locked: boolean }>(
      `SELECT s.locked FROM tasks t JOIN report_sections s ON s.id=t.section_id WHERE t.id=$1 AND t.report_id=$2`,
      [taskId, reportId],
    );
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    if (t.rows[0].locked) throw new Error("LOCKED_SECTION");
    await c.query(
      `UPDATE tasks SET status=COALESCE($2,status), hold_reason=$3, actual_duration_min=COALESCE($4,actual_duration_min), updated_at=now() WHERE id=$1`,
      [taskId, patch.status ?? null, patch.holdReason ?? null, patch.actualMin ?? null],
    );
    await touch(c, reportId);
  });
}

export interface AdvanceInput {
  nightBranch?: "yes" | "no" | null;
  nightReason?: string | null;
  nightExpectedEnd?: string | null;
  dailyComment?: string | null;
  noCommunication?: boolean;
  vacationType?: string | null;
  vacationComment?: string | null;
}

/** 1차(제출/마감) 버튼: 서버에서 현재 모드를 재계산해 전이 */
export async function advanceReport(
  reportId: number,
  input: AdvanceInput,
): Promise<{ mode: string; submitted: boolean }> {
  return tx(async (c) => {
    const { report, secMap } = await loadState(c, reportId);

    // 휴가 우회 방지: 이미 마감된 시간대가 있거나 진행된 보고서엔 vacationType만으로 휴가 전환 불가
    const anyClosed = Object.values(secMap).some((s) => s === "마감완료");
    if (
      input.vacationType &&
      (anyClosed || (report.status !== "미작성" && report.status !== "작성중"))
    ) {
      throw new Error("VACATION_NOT_ALLOWED");
    }

    const isVac = report.is_vacation || !!input.vacationType;
    const mode = computeWriteMode(report.status, isVac, secMap);

    // 읽기 전용(제출/검수중/승인) 보고서는 어떤 변경도 적용하지 않음
    if (mode === "view") return { mode, submitted: false };

    // 공통 필드 저장 (편집 가능 모드에서만)
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

    const submit = async (eventKind: "submitted" | "resubmitted") => {
      await c.query(
        `UPDATE daily_reports SET status='검수대기', submitted_at=now(), updated_at=now() WHERE id=$1`,
        [reportId],
      );
      await c.query(
        `INSERT INTO report_events(report_id, kind, actor_user_id) VALUES ($1,$2,$3)`,
        [reportId, eventKind, report.user_id],
      );
    };

    let submitted = false;
    switch (mode) {
      case "morningPlan":
        await lockSection(c, reportId, "plan");
        await ensureSection(c, reportId, "morning");
        await ensureSection(c, reportId, "afternoon");
        break;
      case "morningClose":
        await lockSection(c, reportId, "morning");
        await ensureSection(c, reportId, "afternoon");
        break;
      case "afternoonClose":
        if (input.nightBranch === "yes") {
          await c.query(
            `UPDATE daily_reports SET night_has=true, night_reason=$2, night_expected_end=$3, updated_at=now() WHERE id=$1`,
            [reportId, input.nightReason ?? null, input.nightExpectedEnd ?? null],
          );
          await lockSection(c, reportId, "afternoon");
          await ensureSection(c, reportId, "night");
        } else {
          await lockSection(c, reportId, "afternoon");
          await submit("submitted");
          submitted = true;
        }
        break;
      case "nightClose":
        await lockSection(c, reportId, "night");
        await submit("submitted");
        submitted = true;
        break;
      case "rejected":
        // 재제출 시 잠기지 않은 모든 섹션을 일괄 잠금(재작성 우회 신규 섹션 포함)
        await c.query(
          `UPDATE report_sections SET status='마감완료', locked=true, closed_at=now()
            WHERE report_id=$1 AND locked=false`,
          [reportId],
        );
        await submit("resubmitted");
        submitted = true;
        break;
      case "vacation":
        await c.query(
          `UPDATE daily_reports SET is_vacation=true, vacation_type=$2, vacation_comment=$3, updated_at=now() WHERE id=$1`,
          [reportId, input.vacationType ?? null, input.vacationComment ?? null],
        );
        await submit("submitted");
        submitted = true;
        break;
      default:
        break;
    }
    return { mode, submitted };
  });
}

const SUBMITTED = ["검수대기", "승인", "제출완료", "재제출"];

/** 직전 보고서의 미완료(완결 아님) 업무를 지정 시간대로 이월 */
export async function carryoverIncomplete(
  reportId: number,
  sectionKind: SectionKind,
): Promise<{ count: number }> {
  return tx(async (c) => {
    const rep = await c.query<{ user_id: number; report_date: string; status: string }>(
      `SELECT user_id, to_char(report_date,'YYYY-MM-DD') AS report_date, status
         FROM daily_reports WHERE id=$1 FOR UPDATE`,
      [reportId],
    );
    const r = rep.rows[0];
    if (!r) throw new Error("NOT_FOUND");
    if (SUBMITTED.includes(r.status)) throw new Error("LOCKED");

    const sec = await c.query<{ id: number; locked: boolean }>(
      `SELECT id, locked FROM report_sections WHERE report_id=$1 AND kind=$2`,
      [reportId, sectionKind],
    );
    let sectionId = sec.rows[0]?.id;
    if (!sectionId) sectionId = await ensureSection(c, reportId, sectionKind);
    else if (sec.rows[0].locked) throw new Error("LOCKED");

    // 직전 보고서 (가장 최근 과거)
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
      await c.query<{ n: number }>(`SELECT COALESCE(MAX(sort_order)+1,0) AS n FROM tasks WHERE section_id=$1`, [
        sectionId,
      ])
    ).rows[0].n;

    let count = 0;
    for (const t of tasks.rows) {
      // 같은 제목이 이미 이 시간대에 있으면 스킵(중복 방지)
      const dup = await c.query(`SELECT 1 FROM tasks WHERE section_id=$1 AND title=$2`, [sectionId, t.title]);
      if (dup.rows[0]) continue;
      await c.query(
        `INSERT INTO tasks(report_id, section_id, project, title, status, sort_order, carried_from_task_id)
         VALUES ($1,$2,$3,$4,'계획',$5,$6)`,
        [reportId, sectionId, t.project, t.title, base++, t.id],
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
    const rep = await c.query<{ status: string }>(
      `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
      [reportId],
    );
    const status = rep.rows[0]?.status;
    if (!status) throw new Error("NOT_FOUND");
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

/** 임시저장: 제출/전이 없이 일일코멘트·야간사유·커뮤없음 플래그만 저장 (제출 전 보고서에만) */
export async function saveDraft(
  reportId: number,
  input: { dailyComment?: string | null; nightReason?: string | null; noCommunication?: boolean },
): Promise<void> {
  return tx(async (c) => {
    const rep = await c.query<{ status: string }>(
      `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
      [reportId],
    );
    const status = rep.rows[0]?.status;
    if (!status) throw new Error("NOT_FOUND");
    if (SUBMITTED.includes(status) || status === "승인") throw new Error("LOCKED_SECTION");
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
