import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { approveReport, canReview, getReviewOwner } from "@/lib/data/review";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!canReview(user, owner)) return forbidden();
  try {
    await approveReport(reportId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_PENDING") return conflict("검수 대기 상태의 보고서만 승인할 수 있습니다.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
