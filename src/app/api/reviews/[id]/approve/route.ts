import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { approveReport, canReview, getReviewOwner } from "@/lib/data/review";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = Number(id);
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!canReview(user, owner)) return forbidden();
  await approveReport(reportId, user.id);
  return NextResponse.json({ ok: true });
}
