import { query, queryOne, tx } from "../db";
import { authorizeReview, getReviewOwner } from "./review";
import type { UserRow } from "./users";

export interface CommentRow {
  id: number;
  task_id: number;
  report_id: number;
  author_user_id: number;
  author_role: string;
  author_name: string;
  body: string;
  created_at: string;
}

export interface TaskContext {
  task_id: number;
  report_id: number;
  owner_user_id: number;
  title: string;
  project: string | null;
  status: string;
}

export async function getTaskContext(taskId: number): Promise<TaskContext | null> {
  return queryOne<TaskContext>(
    `SELECT t.id AS task_id, t.report_id, r.user_id AS owner_user_id,
            t.title, t.project, t.status
       FROM tasks t JOIN daily_reports r ON r.id = t.report_id
      WHERE t.id = $1`,
    [taskId],
  );
}

/**
 * 댓글 접근 권한. canWrite=true면 작성 가능, false면 열람 전용(브리프 §3: 관리자는 열람만).
 * - 작성자 본인: 열람+작성
 * - 검수 액션권자(그룹장 실체/셀프폴백): 열람+작성
 * - 관리자(role=admin): 열람만(canWrite=false)
 * - 그 외: null(접근 불가)
 */
export async function commentAccess(
  taskId: number,
  viewer: UserRow,
): Promise<{ ctx: TaskContext; canWrite: boolean } | null> {
  const ctx = await getTaskContext(taskId);
  if (!ctx) return null;
  if (ctx.owner_user_id === viewer.id) return { ctx, canWrite: true };
  const owner = await getReviewOwner(ctx.report_id);
  if (owner && (await authorizeReview(viewer, owner))) return { ctx, canWrite: true };
  if (viewer.role === "admin") return { ctx, canWrite: false }; // 관리자 열람 전용
  return null; // 권한 없으면 접근 자체 불가
}

export async function listComments(taskId: number): Promise<CommentRow[]> {
  // LEFT JOIN: 작성자가 삭제(SET NULL)돼도 댓글 본문 보존, 이름은 폴백 표기.
  return query<CommentRow>(
    `SELECT tc.id, tc.task_id, tc.report_id, tc.author_user_id, tc.author_role,
            COALESCE(u.name, '(삭제된 사용자)') AS author_name, tc.body, tc.created_at
       FROM task_comments tc LEFT JOIN users u ON u.id = tc.author_user_id
      WHERE tc.task_id = $1 ORDER BY tc.created_at, tc.id`,
    [taskId],
  );
}

/** 댓글 추가. body 1~10,000자(DB CHECK와 동일). author_role 기록(작성 당시 역할). */
export async function addComment(
  taskId: number,
  authorUserId: number,
  authorRole: string,
  body: string,
): Promise<{ id: number }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("EMPTY");
  if (trimmed.length > 10000) throw new Error("TOO_LONG");
  return tx(async (c) => {
    const ctx = await c.query<{ report_id: number }>(`SELECT report_id FROM tasks WHERE id=$1`, [taskId]);
    if (!ctx.rows[0]) throw new Error("NOT_FOUND");
    const r = await c.query<{ id: number }>(
      `INSERT INTO task_comments(task_id, report_id, author_user_id, author_role, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [taskId, ctx.rows[0].report_id, authorUserId, authorRole, trimmed],
    );
    // 작성자는 자기 댓글을 본 것으로 간주(읽음 워터마크 갱신)
    await c.query(
      `INSERT INTO comment_reads(user_id, task_id, last_read_at) VALUES ($1,$2,now())
       ON CONFLICT (user_id, task_id) DO UPDATE SET last_read_at=now()`,
      [authorUserId, taskId],
    );
    return { id: r.rows[0].id };
  });
}

/** 읽음 워터마크 갱신(드로어 열람 시) */
export async function markCommentsRead(userId: number, taskId: number): Promise<void> {
  await query(
    `INSERT INTO comment_reads(user_id, task_id, last_read_at) VALUES ($1,$2,now())
     ON CONFLICT (user_id, task_id) DO UPDATE SET last_read_at=now()`,
    [userId, taskId],
  );
}

export interface CommentMeta {
  count: number;
  unread: boolean;
}

/** 보고서 내 업무별 댓글 수 + 뷰어 기준 미읽음 여부 */
export async function commentMetaForReport(
  reportId: number,
  viewerUserId: number,
): Promise<Map<number, CommentMeta>> {
  const rows = await query<{ task_id: number; cnt: string; unread: boolean }>(
    `SELECT tc.task_id, count(*) AS cnt,
            bool_or(tc.author_user_id <> $2
                    AND tc.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)) AS unread
       FROM task_comments tc
       LEFT JOIN comment_reads cr ON cr.task_id = tc.task_id AND cr.user_id = $2
      WHERE tc.report_id = $1
      GROUP BY tc.task_id`,
    [reportId, viewerUserId],
  );
  const m = new Map<number, CommentMeta>();
  for (const r of rows) m.set(r.task_id, { count: Number(r.cnt), unread: r.unread });
  return m;
}
