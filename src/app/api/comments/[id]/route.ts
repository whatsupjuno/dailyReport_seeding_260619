import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { commentAccess, editComment, getCommentMeta, softDeleteComment } from "@/lib/data/comments";
import type { UserRow } from "@/lib/data/users";

const notFound = () => NextResponse.json({ ok: false, error: "댓글을 찾을 수 없습니다." }, { status: 404 });

/**
 * 인가(브리프 §2-3): 댓글이 존재하고, 미삭제이며, 작성자 본인(author_user_id==세션)이고,
 * 해당 업무에 현재 댓글 작성권한이 있을 때만 수정/삭제 허용.
 * 통과면 {ok:true}, 아니면 {error: NextResponse}.
 */
async function authorizeMutation(
  commentId: number,
  user: UserRow,
): Promise<{ ok: true } | { error: NextResponse }> {
  const meta = await getCommentMeta(commentId);
  if (!meta) return { error: notFound() };
  if (meta.author_user_id !== user.id) return { error: forbidden() }; // 본인 글만
  if (meta.deleted) return { error: badRequest("이미 삭제된 댓글입니다.") };
  const access = await commentAccess(meta.task_id, user);
  if (!access?.canWrite) return { error: forbidden() };
  return { ok: true };
}

// 댓글 수정 — body 교체 + edited=true + mentions 재해석.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const commentId = parseId(id);
  if (commentId == null) return badRequest("잘못된 댓글 ID입니다.");

  const auth = await authorizeMutation(commentId, user);
  if ("error" in auth) return auth.error;

  const payload = (await req.json().catch(() => ({}))) as { body?: unknown };
  if (typeof payload.body !== "string" || !payload.body.trim()) return badRequest("댓글을 입력해 주세요.");

  try {
    const ok = await editComment(commentId, user.id, payload.body);
    if (!ok) return forbidden(); // 경합(동시 삭제 등)으로 변경 0건
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "EMPTY") return badRequest("댓글을 입력해 주세요.");
    if (m === "TOO_LONG") return badRequest("댓글은 최대 10,000자까지 입력할 수 있습니다.");
    throw e;
  }
}

// 댓글 soft-delete — deleted=true + deleted_at=now. 행/대댓글 보존(묘비 표시).
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const commentId = parseId(id);
  if (commentId == null) return badRequest("잘못된 댓글 ID입니다.");

  const auth = await authorizeMutation(commentId, user);
  if ("error" in auth) return auth.error;

  const ok = await softDeleteComment(commentId, user.id);
  if (!ok) return forbidden();
  return NextResponse.json({ ok: true });
}
