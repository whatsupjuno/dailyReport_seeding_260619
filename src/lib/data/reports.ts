import { query, queryOne, tx } from "../db";
import { isV2Date } from "../domain/config";
import { bucketTasks, type Buckets } from "../domain/classify";
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
  is_night: boolean; // #4 야간 플래그
  reject_state: string | null; // #3 NULL=정상, '반려'=행 반려
  rejected_at: string | null;
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
    if (existing.rows[0]) return existing.rows[0].id;

    const r = await c.query<{ id: number }>(
      `INSERT INTO daily_reports(user_id, report_date, status, model_version)
         VALUES ($1,$2,'작성중',$3) RETURNING id`,
      [userId, dateISO, v2 ? 2 : 1],
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
        WHERE r.user_id=$1 AND length(trim(title)) > 0
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

export function sectionStatusMap(sections: SectionRow[]): Partial<Record<SectionKind, string>> {
  const m: Partial<Record<SectionKind, string>> = {};
  for (const s of sections) m[s.kind] = s.status;
  return m;
}

/** #4 v2: 보고서 업무를 오늘 할 일 / 오전 / 오후 / 야간 버킷으로 분류 (야간은 night_has 토글) */
export function bucketedTasks(full: FullReport): Buckets<TaskRow> {
  return bucketTasks(full.tasks, full.report.night_has);
}
