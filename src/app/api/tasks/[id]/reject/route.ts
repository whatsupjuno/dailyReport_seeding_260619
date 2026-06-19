import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getTaskContext } from "@/lib/data/comments";
import { canReview, getReviewOwner } from "@/lib/data/review";
import { rejectTask, undoTaskReject } from "@/lib/data/task-rejections";
import type { UserRow } from "@/lib/data/users";

/** 검수자(그룹장/관리자)만 행 반려. 셀프 검수 금지. */
async function assertReviewer(taskId: number, user: UserRow) {
  const ctx = await getTaskContext(taskId);
  if (!ctx) return { error: badRequest("업무를 찾을 수 없습니다.") };
  const owner = await getReviewOwner(ctx.report_id);
  if (!owner || !canReview(user, owner)) return { error: forbidden() };
  return { ctx };
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const chk = await assertReviewer(taskId, user);
  if (chk.error) return chk.error;

  const body = (await req.json().catch(() => ({}))) as { comment?: string };
  if (!body.comment?.trim()) return badRequest("반려 사유를 입력해 주세요.");

  try {
    await rejectTask(taskId, user.id, body.comment);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_REVIEWABLE") return conflict("계획 제출 또는 검수 대기 상태에서만 행 반려가 가능합니다.");
    if (m === "EMPTY") return badRequest("반려 사유를 입력해 주세요.");
    if (m === "TOO_LONG") return badRequest("반려 사유는 최대 10,000자입니다.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");

  const chk = await assertReviewer(taskId, user);
  if (chk.error) return chk.error;

  try {
    await undoTaskReject(taskId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_REVIEWABLE") return conflict("이미 회신된 반려는 취소할 수 없습니다.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}
