import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { canReview, getReviewOwner, planRejectReport } from "@/lib/data/review";
import { notifyRejected } from "@/lib/mail/notify";

/**
 * 계획 반려(요청#1) — 계획제출 단계 보고서를 그룹장이 한 번에 반려. 사유 ≥10자 필수.
 * 권한: canReview(셀프 false). 셀프 보고서는 자유 편집으로 대체하므로 계획 반려 불가(403).
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!canReview(user, owner)) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { comment?: string };
  const comment = (body.comment ?? "").trim();
  if (comment.length < 10) return badRequest("계획 반려 사유를 10자 이상 입력해 주세요.");
  if (comment.length > 10000) return badRequest("반려 사유는 최대 10,000자입니다.");

  try {
    await planRejectReport(reportId, user.id, comment);
    // 상태변경 커밋 후 직원에게 반려 메일(best-effort)
    await notifyRejected(owner, reportId, comment);
    revalidatePath("/report/[date]", "page");
    revalidatePath("/reports");
    revalidatePath("/review");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_PLAN_SUBMITTED") return conflict("계획 제출 상태의 보고서만 계획 반려할 수 있습니다.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
