import { query, tx } from "../db";
import type { PoolClient } from "pg";

// #3 업무 행 단위 반려. 보고서 status를 바꾸지 않는다(검수대기/계획제출 유지).
//   검수대기→반려 전이는 회신(review.rejectReport) 1회뿐.

/** 행 반려 가능한 보고서 status인지 (C2: 계획제출 ∨ 검수대기). 회신(전체 전이)과 별개. */
async function assertReviewable(c: PoolClient, reportId: number): Promise<void> {
  const r = await c.query<{ status: string }>(
    `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`,
    [reportId],
  );
  if (!r.rows[0]) throw new Error("NOT_FOUND");
  if (r.rows[0].status !== "계획제출" && r.rows[0].status !== "검수대기")
    throw new Error("NOT_REVIEWABLE");
}

/** 행 반려: status 불변. 미해소 반려 최대 1건(UPSERT). */
export async function rejectTask(
  taskId: number,
  reviewerId: number,
  comment: string,
): Promise<void> {
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("EMPTY");
  if (trimmed.length > 10000) throw new Error("TOO_LONG");
  await tx(async (c) => {
    const t = await c.query<{ report_id: number }>(`SELECT report_id FROM tasks WHERE id=$1`, [taskId]);
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    const reportId = t.rows[0].report_id;
    await assertReviewable(c, reportId);
    // 미해소 반려 유일성: 부분 UNIQUE(uq_task_rejection_open) 술어와 동일 조건으로 UPSERT
    const open = await c.query<{ id: number }>(
      `SELECT id FROM task_rejections WHERE task_id=$1 AND resolved_at IS NULL`,
      [taskId],
    );
    if (open.rows[0]) {
      await c.query(
        `UPDATE task_rejections SET comment=$2, rejected_by=$3, rejected_at=now() WHERE id=$1`,
        [open.rows[0].id, trimmed, reviewerId],
      );
    } else {
      await c.query(
        `INSERT INTO task_rejections(task_id, report_id, comment, rejected_by) VALUES ($1,$2,$3,$4)`,
        [taskId, reportId, trimmed, reviewerId],
      );
    }
    await c.query(`UPDATE tasks SET reject_state='반려', rejected_at=now() WHERE id=$1`, [taskId]);
  });
}

/** 행 반려 취소(회신 전). 미해소 건 삭제 + 표시 초기화. */
export async function undoTaskReject(taskId: number): Promise<void> {
  await tx(async (c) => {
    const t = await c.query<{ report_id: number }>(`SELECT report_id FROM tasks WHERE id=$1`, [taskId]);
    if (!t.rows[0]) throw new Error("NOT_FOUND");
    await assertReviewable(c, t.rows[0].report_id);
    await c.query(`DELETE FROM task_rejections WHERE task_id=$1 AND resolved_at IS NULL`, [taskId]);
    await c.query(`UPDATE tasks SET reject_state=NULL, rejected_at=NULL WHERE id=$1`, [taskId]);
  });
}

export async function getOpenTaskRejectCount(reportId: number): Promise<number> {
  const r = await query<{ n: string }>(
    `SELECT count(*) AS n FROM task_rejections WHERE report_id=$1 AND resolved_at IS NULL`,
    [reportId],
  );
  return Number(r[0]?.n ?? 0);
}

export interface TaskRejection {
  task_id: number;
  comment: string;
  rejected_by_name: string | null;
  rejected_at: string;
}

/** 보고서의 미해소 행 반려 맵(렌더용) */
export async function taskRejectionMap(reportId: number): Promise<Map<number, TaskRejection>> {
  const rows = await query<TaskRejection>(
    `SELECT tr.task_id, tr.comment, u.name AS rejected_by_name, tr.rejected_at
       FROM task_rejections tr LEFT JOIN users u ON u.id = tr.rejected_by
      WHERE tr.report_id=$1 AND tr.resolved_at IS NULL`,
    [reportId],
  );
  const m = new Map<number, TaskRejection>();
  for (const r of rows) m.set(r.task_id, r);
  return m;
}
