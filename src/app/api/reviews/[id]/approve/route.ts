import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { approveReport, authorizeReview, getReviewOwner } from "@/lib/data/review";
import { notifyApproved } from "@/lib/mail/notify";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!(await authorizeReview(user, owner))) return forbidden();
  try {
    await approveReport(reportId, user.id);
    // 승인 완료 → 직원에게 알림(셀프승인은 skip). best-effort(메일 실패가 승인을 막지 않음)
    await notifyApproved(owner, reportId, user.id);
    // 승인 후 작성자의 보고서 화면/목록 캐시 무효화(검수 결과가 즉시 반영되도록)
    revalidatePath("/report/[date]", "page");
    revalidatePath("/reports");
    revalidatePath("/review");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_PENDING") return conflict("검수 대기 상태의 보고서만 승인할 수 있습니다.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
