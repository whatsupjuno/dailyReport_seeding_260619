import { query } from "../db";

export interface MgrRow {
  user_id: number;
  name: string;
  dept: string | null;
  report_id: number | null;
  status: string; // 미작성 if no report
  submitted_at: string | null;
  is_vacation: boolean;
  total: number;
  done: number;
  delayed: number;
}

/** 관리자/그룹장 목록: 특정 날짜의 (그룹 or 전체) 구성원 보고 현황 */
export async function listScopeReports(opts: {
  groupId: number | null; // null = 전체(admin)
  date: string;
}): Promise<MgrRow[]> {
  const params: unknown[] = [opts.date];
  let where = "u.active";
  if (opts.groupId != null) {
    params.push(opts.groupId);
    where += ` AND u.group_id = $${params.length}`;
  }
  return query<MgrRow>(
    `SELECT u.id AS user_id, u.name, g.name AS dept,
            r.id AS report_id, COALESCE(r.status::text,'미작성') AS status,
            r.submitted_at, COALESCE(r.is_vacation,false) AS is_vacation,
            COALESCE(tc.total,0) AS total, COALESCE(tc.done,0) AS done, COALESCE(tc.delayed,0) AS delayed
       FROM users u
       LEFT JOIN groups g ON g.id = u.group_id
       LEFT JOIN daily_reports r ON r.user_id = u.id AND r.report_date = $1
       LEFT JOIN (
         SELECT t.report_id, count(*) AS total,
                count(*) FILTER (WHERE t.status='완결') AS done,
                count(*) FILTER (WHERE t.status='지연') AS delayed
           FROM tasks t JOIN report_sections s ON s.id=t.section_id
          WHERE s.kind <> 'plan'
          GROUP BY t.report_id
       ) tc ON tc.report_id = r.id
      WHERE ${where}
      ORDER BY u.name`,
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
           FROM tasks t JOIN report_sections s ON s.id=t.section_id
          WHERE s.kind <> 'plan'
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
