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

function hasReviewActionRole(role: string): boolean {
  return role === "group_leader" || role === "admin";
}

/**
 * 검수 "액션" 권한(승인/반려/행반려): 셀프검수 금지 + owner 그룹의 그룹장 실체(leader_user_id) +
 * 검수 가능한 역할(group_leader/admin) 교집합만 허용.
 */
export function canReview(reviewer: UserRow, owner: ReviewOwner): boolean {
  if (owner.user_id === reviewer.id) return false; // 본인 보고서 셀프 검수 금지(폴백은 authorizeReview)
  return owner.leader_user_id === reviewer.id && hasReviewActionRole(reviewer.role);
}

/**
 * 이 보고서를 검수할 수 있는 "본인 외" 활성 사용자가 존재하는가.
 * - owner 그룹의 활성 그룹장 실체가 본인이 아니고 role이 group_leader/admin이면 true.
 * - 최상위 admin은 false → 본인 셀프 승인 폴백 허용 근거.
 */
export async function ownerHasOtherReviewer(owner: ReviewOwner): Promise<boolean> {
  if (!owner.leader_user_id || owner.leader_user_id === owner.user_id) return false;
  const r = await queryOne<{ active: boolean; role: string }>(
    `SELECT active, role FROM users WHERE id = $1`,
    [owner.leader_user_id],
  );
  return r?.active === true && hasReviewActionRole(r.role);
}

/** 본인 행 self-review 노출 차단 여부. admin이 아니면 fallback 대상이 아니므로 true를 반환한다. */
export async function userHasOtherReviewer(u: { id: number; group_id: number | null }): Promise<boolean> {
  const self = await queryOne<{ role: string }>(`SELECT role FROM users WHERE id = $1`, [u.id]);
  if (self?.role !== "admin") return true;
  if (u.group_id == null) return false;
  const r = await queryOne<{ n: number }>(
    `SELECT count(*)::int AS n FROM groups g JOIN users lu ON lu.id = g.leader_user_id
      WHERE g.id = $1 AND lu.active AND lu.id <> $2 AND lu.role IN ('group_leader','admin')`,
    [u.group_id, u.id],
  );
  return (r?.n ?? 0) > 0;
}

/**
 * 검수 인가(셀프 폴백 포함). 본인 보고서는 "위/동급 검수자가 아무도 없을 때만" 셀프 승인 허용(직무분리 완화는 최상위 한정).
 * 페이지 가드와 승인/반려 API가 공통으로 사용 — 인가 로직 단일화.
 */
export async function authorizeReview(reviewer: UserRow, owner: ReviewOwner): Promise<boolean> {
  if (owner.user_id === reviewer.id) return reviewer.role === "admin" && !(await ownerHasOtherReviewer(owner));
  return canReview(reviewer, owner);
}

/**
 * 검수 화면 "열람" 권한. 관리자(role=admin)는 전체 보고서를 열람 전용으로 볼 수 있다(브리프 §3).
 * 액션(승인/반려/행반려/댓글작성) 가능 여부는 authorizeReview(=canAct)로 별도 판정한다.
 */
export async function canViewReview(reviewer: UserRow, owner: ReviewOwner): Promise<boolean> {
  if (reviewer.role === "admin") return true;
  return authorizeReview(reviewer, owner);
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

/** 계획제출 상태인지 잠금 후 확인 (계획 반려 전용 — 가드~함수 사이 상태변동 TOCTOU 차단) */
async function assertPlanSubmitted(c: import("pg").PoolClient, reportId: number): Promise<void> {
  const cur = await c.query<{ status: string }>(`SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`, [reportId]);
  if (!cur.rows[0]) throw new Error("NOT_FOUND");
  if (cur.rows[0].status !== "계획제출") throw new Error("NOT_PLAN_SUBMITTED");
}

/**
 * 계획 반려(요청#1): 계획제출 단계 보고서 전체를 한 번에 반려(→'반려'). 그룹장의 1차 컨펌.
 * 개별 업무 완료 여부와 무관하게 보고서 레벨 반려. 사유는 라우트에서 ≥10자 검증.
 * 재제출은 기존 경로(반려→검수대기) 재사용(D1 단순안).
 */
export async function planRejectReport(reportId: number, reviewerId: number, comment: string): Promise<void> {
  await tx(async (c) => {
    await assertPlanSubmitted(c, reportId);
    await c.query(`UPDATE daily_reports SET status='반려', updated_at=now() WHERE id=$1`, [reportId]);
    const ev = await c.query<{ id: number }>(
      `INSERT INTO report_events(report_id, kind, actor_user_id, comment) VALUES ($1,'plan_rejected',$2,$3) RETURNING id`,
      [reportId, reviewerId, comment],
    );
    // 계획 단계 미해소 행 반려를 이 회차에 묶음(rejectReport와 동일 — undo 차단·타임라인 일관성)
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
  // 액션 가능한 큐:
  //  (1) 내가 owner 그룹의 그룹장 실체이고 내 role이 group_leader/admin인 팀원 보고서, +
  //  (2) admin 본인 보고서 중 다른 활성 검수자가 없는 경우(최상위 셀프 승인 폴백).
  // 관리자(어느 그룹의 그룹장도 아님)는 본인 폴백 외에는 빈 큐 → 열람은 '팀 보고 현황'(/reports)에서.
  return query<ReviewListItem>(
    `SELECT r.id AS report_id, u.name, g.name AS dept, to_char(r.report_date,'YYYY-MM-DD') AS report_date,
            r.status,
            (g.leader_user_id IS NULL OR g.leader_user_id = u.id OR lu.active IS NOT TRUE OR lu.role NOT IN ('group_leader','admin')) AS no_active_leader
       FROM daily_reports r JOIN users u ON u.id=r.user_id LEFT JOIN groups g ON g.id=u.group_id
       LEFT JOIN users lu ON lu.id = g.leader_user_id
      WHERE r.status IN ('검수대기','계획제출')
        AND ( ($2::text IN ('group_leader','admin') AND g.leader_user_id = $1 AND u.id <> $1)
              OR ($2::text = 'admin' AND u.id = $1 AND (g.leader_user_id IS NULL OR g.leader_user_id = $1 OR lu.active IS NOT TRUE OR lu.role NOT IN ('group_leader','admin'))) )
      ORDER BY COALESCE(r.submitted_at, r.plan_submitted_at) NULLS LAST, r.id`,
    [reviewer.id, reviewer.role],
  );
}
