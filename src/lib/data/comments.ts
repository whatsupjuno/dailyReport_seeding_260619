import { query, queryOne, tx } from "../db";
import { extractMentionNames } from "../domain/mentions";
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
  parent_id: number | null; // NULL=최상위, 값=대댓글(부모 댓글 id, 1단계)
  edited: boolean; // 수정됨 배지
  deleted: boolean; // soft-delete 묘비
  deleted_at: string | null; // 삭제 시각(deleted일 때만)
  mentions: number[]; // 멘션 대상 사용자 id(알림 메타)
}

/** @멘션 자동완성용 멤버(실제 조직 사용자) */
export interface MentionMember {
  id: number;
  name: string;
  role: string;
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
            COALESCE(u.name, '(삭제된 사용자)') AS author_name, tc.body, tc.created_at, tc.parent_id,
            tc.edited, tc.deleted, tc.deleted_at, tc.mentions
       FROM task_comments tc LEFT JOIN users u ON u.id = tc.author_user_id
      WHERE tc.task_id = $1 ORDER BY tc.created_at, tc.id`,
    [taskId],
  );
}

/**
 * @멘션 자동완성용 멤버 목록 — 활성 사용자(데모 이름 아닌 실제 조직 구성원).
 * 이름 오름차순. login_code 등 민감값은 읽지 않음.
 */
export async function listMentionMembers(): Promise<MentionMember[]> {
  return query<MentionMember>(
    `SELECT id, name, role FROM users WHERE active ORDER BY name, id`,
  );
}

/**
 * 본문에서 @멘션 토큰을 추출해 활성 사용자 id로 해석(알림 메타).
 * 분리 정규식은 디자인과 동일(/@[^\s@.,!?()\[\]{}:;]+/g). 이름 정확일치만 채택.
 * 동명이인은 모두 채택(중복 제거). 클라이언트 신뢰 없이 서버에서 해석.
 */
export async function resolveMentions(body: string): Promise<number[]> {
  const names = extractMentionNames(body);
  if (names.length === 0) return [];
  const rows = await query<{ id: number }>(
    `SELECT id FROM users WHERE active AND name = ANY($1::text[])`,
    [names],
  );
  return Array.from(new Set(rows.map((r) => Number(r.id))));
}

/** 수정/삭제 인가용: 댓글의 소유/상태 메타(없으면 null). */
export async function getCommentMeta(
  commentId: number,
): Promise<{ id: number; task_id: number; author_user_id: number | null; deleted: boolean } | null> {
  return queryOne(
    `SELECT id, task_id, author_user_id, deleted FROM task_comments WHERE id = $1`,
    [commentId],
  );
}

/**
 * 댓글 수정 — 작성자 본인만(authorUserId 일치) + 미삭제 행만. body 교체 + edited=true + mentions 갱신.
 * 행이 없거나 소유/상태 불일치면 변경 0건 → false 반환(라우트에서 403/404 매핑).
 */
export async function editComment(
  commentId: number,
  authorUserId: number,
  body: string,
): Promise<boolean> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("EMPTY");
  if (trimmed.length > 10000) throw new Error("TOO_LONG");
  const mentions = await resolveMentions(trimmed);
  const r = await query<{ id: number }>(
    `UPDATE task_comments
        SET body = $1, edited = true, mentions = $2::bigint[]
      WHERE id = $3 AND author_user_id = $4 AND NOT deleted
      RETURNING id`,
    [trimmed, mentions, commentId, authorUserId],
  );
  return r.length > 0;
}

/**
 * 댓글 soft-delete — 작성자 본인만 + 미삭제 행만. 행/대댓글 보존, deleted=true + deleted_at=now만 세팅.
 * 변경 0건이면 false(이미 삭제/타인/없음).
 */
export async function softDeleteComment(commentId: number, authorUserId: number): Promise<boolean> {
  const r = await query<{ id: number }>(
    `UPDATE task_comments
        SET deleted = true, deleted_at = now()
      WHERE id = $1 AND author_user_id = $2 AND NOT deleted
      RETURNING id`,
    [commentId, authorUserId],
  );
  return r.length > 0;
}

/**
 * 댓글 추가. body 1~10,000자(DB CHECK와 동일). author_role 기록(작성 당시 역할).
 * parentId 주면 대댓글 — 부모가 같은 업무의 댓글인지 검증(IDOR 차단) + 1단계로 평탄화
 * (부모가 이미 대댓글이면 그 최상위 root에 매단다).
 */
export async function addComment(
  taskId: number,
  authorUserId: number,
  authorRole: string,
  body: string,
  parentId?: number | null,
): Promise<{ id: number; mentions: number[]; reportId: number; parentAuthorId: number | null }> {
  const trimmed = body.trim();
  if (trimmed.length === 0) throw new Error("EMPTY");
  if (trimmed.length > 10000) throw new Error("TOO_LONG");
  const mentions = await resolveMentions(trimmed);
  return tx(async (c) => {
    const ctx = await c.query<{ report_id: number }>(`SELECT report_id FROM tasks WHERE id=$1`, [taskId]);
    if (!ctx.rows[0]) throw new Error("NOT_FOUND");
    let parent: number | string | null = null;
    // 알림 수신자(스레드 상대편)용: '내가 답글을 단 부모 댓글'의 작성자(평탄화 전, 클릭한 부모 기준).
    let parentAuthorId: number | null = null;
    if (parentId != null) {
      // 같은 업무의 댓글만 부모로 허용. 부모가 자식이면 그 root(parent_id)로 평탄화 → 항상 1단계.
      const p = await c.query<{ id: number; parent_id: number | null; author_user_id: number | null }>(
        `SELECT id, parent_id, author_user_id FROM task_comments WHERE id=$1 AND task_id=$2`,
        [parentId, taskId],
      );
      if (!p.rows[0]) throw new Error("INVALID_PARENT");
      parent = p.rows[0].parent_id ?? p.rows[0].id;
      parentAuthorId = p.rows[0].author_user_id == null ? null : Number(p.rows[0].author_user_id);
    }
    const r = await c.query<{ id: number }>(
      `INSERT INTO task_comments(task_id, report_id, author_user_id, author_role, body, parent_id, mentions)
       VALUES ($1,$2,$3,$4,$5,$6,$7::bigint[]) RETURNING id`,
      [taskId, ctx.rows[0].report_id, authorUserId, authorRole, trimmed, parent, mentions],
    );
    // 작성자는 자기 댓글을 본 것으로 간주(읽음 워터마크 갱신)
    await c.query(
      `INSERT INTO comment_reads(user_id, task_id, last_read_at) VALUES ($1,$2,now())
       ON CONFLICT (user_id, task_id) DO UPDATE SET last_read_at=now()`,
      [authorUserId, taskId],
    );
    return { id: r.rows[0].id, mentions, reportId: Number(ctx.rows[0].report_id), parentAuthorId };
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
  /** 스레드의 마지막(미삭제) 댓글이 그룹장 작성·뷰어 본인 아님·미읽음 → 작성화면 '미확인'(파란) 배지 */
  leaderUnread: boolean;
}

/** 보고서 내 업무별 댓글 수 + 뷰어 기준 미읽음 여부 + 그룹장 미확인 피드백 여부 */
export async function commentMetaForReport(
  reportId: number,
  viewerUserId: number,
): Promise<Map<number, CommentMeta>> {
  const rows = await query<{ task_id: number; cnt: string; unread: boolean; leader_unread: boolean | null }>(
    `SELECT tc.task_id, count(*) AS cnt,
            bool_or(tc.author_user_id <> $2
                    AND tc.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)) AS unread,
            (SELECT last.author_role = 'group_leader'
                    AND last.author_user_id IS DISTINCT FROM $2
                    AND last.created_at > COALESCE(cr.last_read_at, 'epoch'::timestamptz)
               FROM task_comments last
              WHERE last.task_id = tc.task_id AND NOT last.deleted
              ORDER BY last.created_at DESC, last.id DESC
              LIMIT 1) AS leader_unread
       FROM task_comments tc
       LEFT JOIN comment_reads cr ON cr.task_id = tc.task_id AND cr.user_id = $2
      WHERE tc.report_id = $1
      GROUP BY tc.task_id, cr.last_read_at`,
    [reportId, viewerUserId],
  );
  const m = new Map<number, CommentMeta>();
  for (const r of rows)
    m.set(r.task_id, { count: Number(r.cnt), unread: r.unread, leaderUnread: !!r.leader_unread });
  return m;
}
