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

/** 검수 권한: admin 전체, group_leader는 자기 그룹(=그룹장인 그룹) 보고서만 */
export function canReview(reviewer: UserRow, owner: ReviewOwner): boolean {
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

export async function approveReport(reportId: number, reviewerId: number): Promise<void> {
  await tx(async (c) => {
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
    const kinds = targetKinds(target);
    await c.query(
      `UPDATE report_sections SET status='재작성', locked=false
        WHERE report_id=$1 AND kind = ANY($2::section_kind[]) AND locked=true`,
      [reportId, kinds],
    );
    await c.query(`UPDATE daily_reports SET status='반려', updated_at=now() WHERE id=$1`, [reportId]);
    await c.query(
      `INSERT INTO report_events(report_id, kind, actor_user_id, comment, reject_target)
       VALUES ($1,'rejected',$2,$3,$4)`,
      [reportId, reviewerId, comment, target],
    );
  });
}

export interface ReviewListItem {
  report_id: number;
  name: string;
  dept: string | null;
  report_date: string;
}

export async function reviewQueueForReviewer(reviewer: UserRow): Promise<ReviewListItem[]> {
  if (reviewer.role === "admin") {
    return query<ReviewListItem>(
      `SELECT r.id AS report_id, u.name, g.name AS dept, to_char(r.report_date,'YYYY-MM-DD') AS report_date
         FROM daily_reports r JOIN users u ON u.id=r.user_id LEFT JOIN groups g ON g.id=u.group_id
        WHERE r.status='검수대기' ORDER BY r.submitted_at NULLS LAST, r.id`,
    );
  }
  // group_leader: 자기 그룹
  return query<ReviewListItem>(
    `SELECT r.id AS report_id, u.name, g.name AS dept, to_char(r.report_date,'YYYY-MM-DD') AS report_date
       FROM daily_reports r JOIN users u ON u.id=r.user_id JOIN groups g ON g.id=u.group_id
      WHERE r.status='검수대기' AND g.leader_user_id=$1 ORDER BY r.submitted_at NULLS LAST, r.id`,
    [reviewer.id],
  );
}
