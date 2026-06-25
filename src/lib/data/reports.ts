import { query, queryOne, tx } from "../db";
import type { PoolClient } from "pg";
import { isV2Date } from "../domain/config";
import { bucketTasks, byCompletedThenCreated, type Buckets } from "../domain/classify";
import { DEFAULT_WINDOW, type GroupWindow } from "../domain/window";
import type { ReportStatus, SectionKind, TaskStatus } from "../domain/status";

export interface ReportRow {
  id: number;
  user_id: number;
  report_date: string;
  status: ReportStatus;
  is_vacation: boolean;
  vacation_type: string | null;
  vacation_comment: string | null;
  daily_comment: string | null;
  night_has: boolean;
  night_reason: string | null;
  night_expected_end: string | null;
  no_communication: boolean;
  submitted_at: string | null;
  model_version: number; // 1=레거시 섹션, 2=단일목록(v2)
  plan_submitted_at: string | null; // C2 1차(계획) 제출 표식
  updated_at: string; // 마지막 저장 시각(헤더 '저장됨' 표시용)
  // 그룹 시간정책 스냅샷(보고서 생성 시 고정). win_snapshotted=false면 DEFAULT_WINDOW 폴백.
  win_snapshotted: boolean;
  win_is_ai: boolean | null;
  win_write_start: string | null;
  win_write_end: string | null;
  win_submit_due: string | null;
}

export interface SectionRow {
  id: number;
  report_id: number;
  kind: SectionKind;
  status: string;
  locked: boolean;
}

export interface TaskRow {
  id: number;
  report_id: number;
  section_id: number | null; // v2는 NULL(섹션 비의존)
  project: string | null;
  title: string;
  planned_start: string | null;
  planned_duration_min: number | null;
  actual_duration_min: number | null;
  status: TaskStatus;
  hold_reason: string | null;
  sort_order: number;
  completed_at: string | null; // #4 마감 시각(KST 분류 기준)
  created_at: string | null; // 등록 시각(오전/오후 동률 정렬 타이브레이크)
  is_night: boolean; // #4 야간 플래그
  reject_state: string | null; // #3 NULL=정상, '반려'=행 반려
  rejected_at: string | null;
  description: string | null; // 업무 설명(상세)
}

export interface CommRow {
  id: number;
  report_id: number;
  comm_type: string;
  counterpart: string;
  occurred_at: string | null;
  summary: string;
}

export interface EventRow {
  id: number;
  report_id: number;
  kind: string;
  actor_user_id: number | null;
  actor_name?: string | null;
  comment: string | null;
  reject_target: string | null;
  created_at: string;
}

export interface FullReport {
  report: ReportRow;
  sections: SectionRow[];
  tasks: TaskRow[];
  comms: CommRow[];
  events: EventRow[];
}

/**
 * 보고서가 없으면 생성. 있으면 그대로. report id 반환.
 * - v2(컷오버 이후/기본): model_version=2, plan 섹션 미생성(단일목록).
 * - v1(컷오버 이전): 종전대로 model_version=1 + plan 섹션 생성(레거시 동결 렌더).
 */
export async function getOrCreateReport(userId: number, dateISO: string): Promise<number> {
  const v2 = isV2Date(dateISO);
  return tx(async (c) => {
    const existing = await c.query<{ id: number }>(
      `SELECT id FROM daily_reports WHERE user_id = $1 AND report_date = $2`,
      [userId, dateISO],
    );
    if (existing.rows[0]) return existing.rows[0].id; // 기존 행 유지 → 정책 변경은 '다음 보고서부터'

    const win = await loadGroupWindow(c, userId); // 생성 시점 그룹 정책 스냅샷(고정)
    const r = await c.query<{ id: number }>(
      `INSERT INTO daily_reports(user_id, report_date, status, model_version,
         win_snapshotted, win_is_ai, win_write_start, win_write_end, win_submit_due)
         VALUES ($1,$2,'작성중',$3, true, $4,$5,$6,$7) RETURNING id`,
      [userId, dateISO, v2 ? 2 : 1, win.isAi, win.writeStart, win.writeEnd, win.submitDue],
    );
    const reportId = r.rows[0].id;
    if (!v2) {
      await c.query(
        `INSERT INTO report_sections(report_id, kind, status) VALUES ($1,'plan','작성중')`,
        [reportId],
      );
    }
    return reportId;
  });
}

export async function getReportByUserDate(userId: number, dateISO: string): Promise<ReportRow | null> {
  return queryOne<ReportRow>(
    `SELECT * FROM daily_reports WHERE user_id = $1 AND report_date = $2`,
    [userId, dateISO],
  );
}

function rowToWindow(row: { is_ai_group: boolean | null; write_start: string | null; write_end: string | null; submit_due: string | null } | null): GroupWindow {
  // 그룹 없음(LEFT JOIN 전부 NULL)이면 DEFAULT_WINDOW. is_ai_group=false는 정상 비-AI 그룹.
  if (!row || row.is_ai_group == null) return DEFAULT_WINDOW;
  return {
    isAi: row.is_ai_group,
    writeStart: row.write_start ?? "00:00:00",
    writeEnd: row.write_end ?? "23:59:00",
    submitDue: row.submit_due,
  };
}

async function loadGroupWindow(c: PoolClient, userId: number): Promise<GroupWindow> {
  const r = await c.query<{ is_ai_group: boolean | null; write_start: string | null; write_end: string | null; submit_due: string | null }>(
    `SELECT g.is_ai_group, g.write_start, g.write_end, g.submit_due
       FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = $1`,
    [userId],
  );
  return rowToWindow(r.rows[0] ?? null);
}

/** 사용자의 그룹 시간정책(현재값). 그룹 없으면 DEFAULT_WINDOW. 보고일 계산(reportDateFor)·자동제출 대상 선정에 사용. */
export async function getUserGroupWindow(userId: number): Promise<GroupWindow> {
  const row = await queryOne<{ is_ai_group: boolean | null; write_start: string | null; write_end: string | null; submit_due: string | null }>(
    `SELECT g.is_ai_group, g.write_start, g.write_end, g.submit_due
       FROM users u LEFT JOIN groups g ON g.id = u.group_id WHERE u.id = $1`,
    [userId],
  );
  return rowToWindow(row);
}

/** 보고서의 스냅샷 정책(생성 시 고정). 미스냅샷(기존 행)이면 DEFAULT_WINDOW. */
export function effectiveWindow(r: ReportRow): GroupWindow {
  if (!r.win_snapshotted) return DEFAULT_WINDOW;
  return {
    isAi: !!r.win_is_ai,
    writeStart: r.win_write_start ?? "00:00:00",
    writeEnd: r.win_write_end ?? "23:59:00",
    submitDue: r.win_submit_due,
  };
}

export async function loadFullReport(reportId: number): Promise<FullReport | null> {
  const report = await queryOne<ReportRow>(`SELECT * FROM daily_reports WHERE id = $1`, [reportId]);
  if (!report) return null;
  const sections = await query<SectionRow>(
    `SELECT * FROM report_sections WHERE report_id = $1 ORDER BY
       CASE kind WHEN 'plan' THEN 0 WHEN 'morning' THEN 1 WHEN 'afternoon' THEN 2 ELSE 3 END`,
    [reportId],
  );
  const tasks = await query<TaskRow>(
    `SELECT * FROM tasks WHERE report_id = $1 ORDER BY section_id, sort_order, id`,
    [reportId],
  );
  const comms = await query<CommRow>(
    `SELECT * FROM communications WHERE report_id = $1 ORDER BY occurred_at, id`,
    [reportId],
  );
  const events = await query<EventRow>(
    `SELECT e.*, u.name AS actor_name FROM report_events e
       LEFT JOIN users u ON u.id = e.actor_user_id
      WHERE e.report_id = $1 ORDER BY e.created_at, e.id`,
    [reportId],
  );
  return { report, sections, tasks, comms, events };
}

export interface RecentTask {
  name: string;
  project: string | null;
  planned: number | null;
}

/** 사용자의 최근 업무(제목별 최신 1건) — 자동완성/반복 업무용 */
export async function recentTaskSuggestions(userId: number, limit = 8): Promise<RecentTask[]> {
  return query<RecentTask>(
    `SELECT s.name, s.project, s.planned FROM (
       SELECT DISTINCT ON (lower(title)) title AS name, project, planned_duration_min AS planned, t.id AS tid
         FROM tasks t JOIN daily_reports r ON r.id=t.report_id
        WHERE r.user_id=$1 AND r.is_vacation = false AND length(trim(title)) > 0
        ORDER BY lower(title), t.id DESC
     ) s ORDER BY s.tid DESC LIMIT $2`,
    [userId, limit],
  );
}

export async function getReportOwnerId(reportId: number): Promise<number | null> {
  const r = await queryOne<{ user_id: number }>(`SELECT user_id FROM daily_reports WHERE id=$1`, [
    reportId,
  ]);
  return r?.user_id ?? null;
}

export async function getTaskOwner(
  taskId: number,
): Promise<{ report_id: number; user_id: number } | null> {
  return queryOne<{ report_id: number; user_id: number }>(
    `SELECT t.report_id, r.user_id FROM tasks t JOIN daily_reports r ON r.id=t.report_id WHERE t.id=$1`,
    [taskId],
  );
}

export async function getCommOwner(
  commId: number,
): Promise<{ report_id: number; user_id: number } | null> {
  return queryOne<{ report_id: number; user_id: number }>(
    `SELECT cm.report_id, r.user_id FROM communications cm JOIN daily_reports r ON r.id=cm.report_id WHERE cm.id=$1`,
    [commId],
  );
}

export function sectionStatusMap(sections: SectionRow[]): Partial<Record<SectionKind, string>> {
  const m: Partial<Record<SectionKind, string>> = {};
  for (const s of sections) m[s.kind] = s.status;
  return m;
}

/** #4 v2: 보고서 업무를 오늘 할 일 / 오전 / 오후 / 야간 버킷으로 분류 (야간은 night_has 토글) */
export function bucketedTasks(full: FullReport): Buckets<TaskRow> {
  return bucketTasks(full.tasks, full.report.night_has);
}

/** AI 그룹: 오전/오후/야간 버킷 없이 미완료(todo) + 완료(24시간 타임라인, 완료시각 오름차순). */
export function aiTimelineTasks(full: FullReport): { todo: TaskRow[]; done: TaskRow[] } {
  const todo: TaskRow[] = [];
  const done: TaskRow[] = [];
  for (const t of full.tasks) {
    if ((t.status === "완결" || t.status === "지연") && t.completed_at != null) done.push(t);
    else todo.push(t);
  }
  done.sort(byCompletedThenCreated);
  return { todo, done };
}
