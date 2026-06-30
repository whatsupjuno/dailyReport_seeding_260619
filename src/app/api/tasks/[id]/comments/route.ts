import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import {
  addComment,
  commentAccess,
  listComments,
  markCommentsRead,
} from "@/lib/data/comments";
import { notifyComment } from "@/lib/mail/notify";

const ROLE_LABEL: Record<string, string> = {
  employee: "직원",
  group_leader: "그룹장",
  admin: "관리자",
};

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const access = await commentAccess(taskId, user);
  if (!access) return forbidden();

  await markCommentsRead(user.id, taskId);
  const comments = await listComments(taskId);
  return NextResponse.json({
    ok: true,
    canWrite: access.canWrite,
    task: { id: access.ctx.task_id, title: access.ctx.title, project: access.ctx.project, status: access.ctx.status },
    comments: comments.map((c) => ({
      id: Number(c.id),
      parentId: c.parent_id == null ? null : Number(c.parent_id),
      author: c.author_name,
      role: ROLE_LABEL[c.author_role] ?? c.author_role,
      body: c.body,
      at: c.created_at,
      me: c.author_user_id === user.id,
      edited: c.edited,
      deleted: c.deleted,
      deletedAt: c.deleted_at,
    })),
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const access = await commentAccess(taskId, user);
  if (!access) return forbidden();
  if (!access.canWrite) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { body?: string; parentId?: number };
  if (!body.body?.trim()) return badRequest("댓글을 입력해 주세요.");
  let parentId: number | null = null;
  if (body.parentId != null) {
    if (!Number.isSafeInteger(body.parentId) || body.parentId <= 0)
      return badRequest("잘못된 답글 대상입니다.");
    parentId = body.parentId;
  }

  try {
    const res = await addComment(taskId, user.id, user.role, body.body, parentId);
    // 댓글/대댓글/@멘션 → 수신자에게 즉시 알림(승인/반려 즉시발송 미러링). best-effort(메일 실패가 저장을 막지 않음).
    await notifyComment({
      taskId,
      reportId: res.reportId,
      authorId: user.id,
      body: body.body,
      isReply: parentId != null,
      parentAuthorId: res.parentAuthorId,
      mentions: res.mentions,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "EMPTY") return badRequest("댓글을 입력해 주세요.");
    if (m === "TOO_LONG") return badRequest("댓글은 최대 10,000자까지 입력할 수 있습니다.");
    if (m === "INVALID_PARENT") return badRequest("답글을 달 댓글을 찾을 수 없습니다.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}
