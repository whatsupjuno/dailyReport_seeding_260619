import { query } from "../db";

export interface MgrRow {
  user_id: number;
  name: string;
  dept: string | null;
  report_id: number | null;
  report_date: string | null; // 단일-날짜 조회 시 그 날짜, 상태별(날짜 무관) 조회 시 보고서 실제 날짜
  status: string; // 미작성 if no report
  submitted_at: string | null;
  is_vacation: boolean;
  total: number;
  done: number;
  delayed: number;
}

/** 관리자/그룹장 목록: 특정 날짜의 (그룹 or 전체) 구성원 보고 현황 */
/** 한 사용자가 그룹장인 모든 그룹 id(복수 그룹장 지원). */
export async function listLedGroupIds(userId: number): Promise<number[]> {
  const rows = await query<{ id: number }>(`SELECT id FROM groups WHERE leader_user_id = $1 ORDER BY id`, [userId]);
  return rows.map((r) => Number(r.id));
}

export async function listScopeReports(opts: {
  groupIds: number[] | null; // null = 전체(admin) / 배열 = 해당 그룹들(그룹장이 맡은 그룹 복수)
  date: string;
}): Promise<MgrRow[]> {
  const params: unknown[] = [opts.date];
  // 작성 대상(report_required)만 — 비대상자는 '미작성' 현황에 표시하지 않음
  let where = "u.active AND COALESCE(u.report_required, true)";
  if (opts.groupIds != null) {
    params.push(opts.groupIds);
    where += ` AND u.group_id = ANY($${params.length}::bigint[])`;
  }
  return query<MgrRow>(
    `SELECT u.id AS user_id, u.name, g.name AS dept,
            r.id AS report_id, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
            COALESCE(r.status::text,'미작성') AS status,
            r.submitted_at, COALESCE(r.is_vacation,false) AS is_vacation,
            COALESCE(tc.total,0) AS total, COALESCE(tc.done,0) AS done, COALESCE(tc.delayed,0) AS delayed
       FROM users u
       LEFT JOIN groups g ON g.id = u.group_id
       LEFT JOIN daily_reports r ON r.user_id = u.id AND r.report_date = $1
       LEFT JOIN (
         SELECT t.report_id, count(*) AS total,
                count(*) FILTER (WHERE t.status='완결') AS done,
                count(*) FILTER (WHERE t.status='지연') AS delayed
           FROM tasks t LEFT JOIN report_sections s ON s.id=t.section_id
          WHERE s.kind IS NULL OR s.kind <> 'plan'  -- v2(section_id NULL) 포함, v1 plan 섹션만 제외
          GROUP BY t.report_id
       ) tc ON tc.report_id = r.id
      WHERE ${where}
      ORDER BY u.name`,
    params,
  );
}

/**
 * 관리자/그룹장 목록: 날짜와 무관하게 특정 상태(예: 승인)인 보고서를 최근순으로.
 * 단일-날짜 스냅샷(listScopeReports)에선 과거 승인분이 안 보이므로, '승인 완료' 이력 조회용.
 */
export async function listScopeReportsByStatus(opts: {
  groupIds: number[] | null; // null = 전체(admin) / 배열 = 해당 그룹들
  statuses: string[];
  limit?: number;
}): Promise<MgrRow[]> {
  const params: unknown[] = [opts.statuses];
  let where = "u.active AND r.status::text = ANY($1::text[])";
  if (opts.groupIds != null) {
    params.push(opts.groupIds);
    where += ` AND u.group_id = ANY($${params.length}::bigint[])`;
  }
  params.push(opts.limit ?? 300);
  return query<MgrRow>(
    `SELECT u.id AS user_id, u.name, g.name AS dept,
            r.id AS report_id, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
            r.status::text AS status,
            r.submitted_at, COALESCE(r.is_vacation,false) AS is_vacation,
            COALESCE(tc.total,0) AS total, COALESCE(tc.done,0) AS done, COALESCE(tc.delayed,0) AS delayed
       FROM daily_reports r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN groups g ON g.id = u.group_id
       LEFT JOIN (
         SELECT t.report_id, count(*) AS total,
                count(*) FILTER (WHERE t.status='완결') AS done,
                count(*) FILTER (WHERE t.status='지연') AS delayed
           FROM tasks t LEFT JOIN report_sections s ON s.id=t.section_id
          WHERE s.kind IS NULL OR s.kind <> 'plan'
          GROUP BY t.report_id
       ) tc ON tc.report_id = r.id
      WHERE ${where}
      ORDER BY r.report_date DESC, u.name
      LIMIT $${params.length}`,
    params,
  );
}

export interface EmpRow {
  report_id: number;
  report_date: string;
  status: string;
  submitted_at: string | null;
  is_vacation: boolean;
  total: number;
  done: number;
  delayed: number;
}

/** 직원 본인 보고서 이력 (최근 N건) */
export async function listMyReports(userId: number, limit = 30): Promise<EmpRow[]> {
  return query<EmpRow>(
    `SELECT r.id AS report_id, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
            r.status, r.submitted_at, r.is_vacation,
            COALESCE(tc.total,0) AS total, COALESCE(tc.done,0) AS done, COALESCE(tc.delayed,0) AS delayed
       FROM daily_reports r
       LEFT JOIN (
         SELECT t.report_id, count(*) AS total,
                count(*) FILTER (WHERE t.status='완결') AS done,
                count(*) FILTER (WHERE t.status='지연') AS delayed
           FROM tasks t LEFT JOIN report_sections s ON s.id=t.section_id
          WHERE s.kind IS NULL OR s.kind <> 'plan'  -- v2(section_id NULL) 포함, v1 plan 섹션만 제외
          GROUP BY t.report_id
       ) tc ON tc.report_id = r.id
      WHERE r.user_id = $1
      ORDER BY r.report_date DESC
      LIMIT $2`,
    [userId, limit],
  );
}

export interface ReviewQueueRow {
  report_id: number;
  user_id: number;
  name: string;
  dept: string | null;
  report_date: string;
  submitted_at: string | null;
}

/** 검수 대기 큐: 그룹장 권한 범위(그룹) 내 검수대기 보고서 */
export async function listReviewQueue(groupId: number | null): Promise<ReviewQueueRow[]> {
  const params: unknown[] = [];
  let where = "r.status = '검수대기'";
  if (groupId != null) {
    params.push(groupId);
    where += ` AND u.group_id = $${params.length}`;
  }
  return query<ReviewQueueRow>(
    `SELECT r.id AS report_id, u.id AS user_id, u.name, g.name AS dept,
            to_char(r.report_date,'YYYY-MM-DD') AS report_date, r.submitted_at
       FROM daily_reports r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN groups g ON g.id = u.group_id
      WHERE ${where}
      ORDER BY r.submitted_at NULLS LAST, r.id`,
    params,
  );
}
