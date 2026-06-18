import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { canReview, getReviewOwner, rejectReport } from "@/lib/data/review";

const TARGETS = ["전체", "오전", "오후", "야간"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = Number(id);
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!canReview(user, owner)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { comment?: string; target?: string };
  const comment = (body.comment ?? "").trim();
  const target = TARGETS.includes(body.target ?? "") ? (body.target as string) : "전체";
  if (!comment) return badRequest("반려 사유(그룹장 코멘트)를 입력해 주세요.");

  await rejectReport(reportId, user.id, comment, target);
  return NextResponse.json({ ok: true });
}
