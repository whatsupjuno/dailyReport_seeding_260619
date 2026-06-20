import { query, queryOne, tx } from "../db";
import type { SectionKind } from "../domain/status";
import type { UserRow } from "./users";

export interface ReviewOwner {
  user_id: number;
  name: string;
  group_id: number | null;
  group_name: string | null;
  leader_user_id: number | null;
  role: string;
}

export async function getReviewOwner(reportId: number): Promise<ReviewOwner | null> {
  return queryOne<ReviewOwner>(
    `SELECT u.id AS user_id, u.name, u.group_id, u.role,
            g.name AS group_name, g.leader_user_id
       FROM daily_reports r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN groups g ON g.id = u.group_id
      WHERE r.id = $1`,
    [reportId],
  );
}

/** 검수 권한: 셀프검수 금지, admin 전체, group_leader는 자기 그룹(=그룹장인 그룹) 보고서만 */
export function canReview(reviewer: UserRow, owner: ReviewOwner): boolean {
  if (owner.user_id === reviewer.id) return false; // 본인 보고서 셀프 검수 금지(직무분리)
  if (reviewer.role === "admin") return true;
  if (reviewer.role === "group_leader") return owner.leader_user_id === reviewer.id;
  return false;
}

function targetKinds(target: string): SectionKind[] {
  switch (target) {
    case "오전":
      return ["morning"];
    case "오후":
      return ["afternoon"];
    case "야간":
      return ["night"];
    default:
      return ["plan", "morning", "afternoon", "night"]; // 전체
  }
}

/** 검수대기 상태인지 잠금 후 확인 (이중검수/임의상태 전이 방지) */
async function assertPending(c: import("pg").PoolClient, reportId: number): Promise<void> {
  const cur = await c.query<{ status: string }>(
    `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
    [reportId],
  );
  if (!cur.rows[0]) throw new Error("NOT_FOUND");
  if (cur.rows[0].status !== "검수대기") throw new Error("NOT_PENDING");
}

export async function approveReport(reportId: number, reviewerId: number): Promise<void> {
  await tx(async (c) => {
    await assertPending(c, reportId);
    // 승인 시 미해소 행 반려는 무의미 → 해소 처리(표시 초기화)
    await c.query(
      `UPDATE task_rejections SET resolved_at=now() WHERE report_id=$1 AND resolved_at IS NULL`,
      [reportId],
    );
    await c.query(`UPDATE tasks SET reject_state=NULL WHERE report_id=$1 AND reject_state='반려'`, [reportId]);
    await c.query(`UPDATE daily_reports SET status='승인', updated_at=now() WHERE id=$1`, [reportId]);
    await c.query(
      `INSERT INTO report_events(report_id, kind, actor_user_id) VALUES ($1,'approved',$2)`,
      [reportId, reviewerId],
    );
  });
}

/** 반려: 지목 시간대를 재작성(잠금해제)으로, 상태 반려, 이력 기록 */
export async function rejectReport(
  reportId: number,
  reviewerId: number,
  comment: string,
  target: string,
): Promise<void> {
  await tx(async (c) => {
    await assertPending(c, reportId);
    // v1 레거시: 지목 시간대 섹션 잠금 해제(v2는 섹션 없으므로 0행)
    const kinds = targetKinds(target);
    await c.query(
      `UPDATE report_sections SET status='재작성', locked=false
        WHERE report_id=$1 AND kind = ANY($2::section_kind[]) AND locked=true`,
      [reportId, kinds],
    );
    await c.query(`UPDATE daily_reports SET status='반려', updated_at=now() WHERE id=$1`, [reportId]);
    const ev = await c.query<{ id: number }>(
      `INSERT INTO report_events(report_id, kind, actor_user_id, comment, reject_target)
       VALUES ($1,'rejected',$2,$3,$4) RETURNING id`,
      [reportId, reviewerId, comment, target],
    );
    // 부분 반려 회신: 미해소 행 반려를 이 회신 회차에 묶음(A-1)
    await c.query(
      `UPDATE task_rejections SET event_id=$2 WHERE report_id=$1 AND resolved_at IS NULL AND event_id IS NULL`,
      [reportId, ev.rows[0].id],
    );
  });
}

export interface ReviewListItem {
  report_id: number;
  name: string;
  dept: string | null;
  report_date: string;
  status?: string;
  no_active_leader?: boolean; // owner 그룹에 활성 그룹장 부재(admin 폴백만 가능) — 큐 강조용
}

export async function reviewQueueForReviewer(reviewer: UserRow): Promise<ReviewListItem[]> {
  if (reviewer.role === "admin") {
    // admin도 본인 보고서는 셀프검수 불가 → 제외
    return query<ReviewListItem>(
      `SELECT r.id AS report_id, u.name, g.name AS dept, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
              r.status, (g.leader_user_id IS NULL OR lu.active IS NOT TRUE) AS no_active_leader
         FROM daily_reports r JOIN users u ON u.id=r.user_id LEFT JOIN groups g ON g.id=u.group_id
         LEFT JOIN users lu ON lu.id = g.leader_user_id
        WHERE r.status IN ('검수대기','계획제출') AND r.user_id <> $1
        ORDER BY COALESCE(r.submitted_at, r.plan_submitted_at) NULLS LAST, r.id`,
      [reviewer.id],
    );
  }
  // group_leader: 자기 그룹, 본인 제외. C2: 계획제출도 행 단위 검토 가능 → 큐 노출
  return query<ReviewListItem>(
    `SELECT r.id AS report_id, u.name, g.name AS dept, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
            r.status
       FROM daily_reports r JOIN users u ON u.id=r.user_id JOIN groups g ON g.id=u.group_id
      WHERE r.status IN ('검수대기','계획제출') AND g.leader_user_id=$1 AND u.id <> $1
      ORDER BY COALESCE(r.submitted_at, r.plan_submitted_at) NULLS LAST, r.id`,
    [reviewer.id],
  );
}
