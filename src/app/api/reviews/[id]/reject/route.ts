import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { authorizeReview, getReviewOwner, rejectReport } from "@/lib/data/review";
import { getOpenTaskRejectCount } from "@/lib/data/task-rejections";
import { notifyRejected } from "@/lib/mail/notify";

const TARGETS = ["전체", "오전", "오후", "야간"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReviewOwner(reportId);
  if (!owner) return badRequest("보고서를 찾을 수 없습니다.");
  if (!(await authorizeReview(user, owner))) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { comment?: string; target?: string };
  const comment = (body.comment ?? "").trim();
  const target = TARGETS.includes(body.target ?? "") ? (body.target as string) : "전체";
  if (comment.length > 10000) return badRequest("반려 코멘트는 최대 10,000자입니다.");
  // 부분 반려로 회신: 미해소 행 반려가 1건 이상이면 전역 코멘트 비어도 허용(A-1)
  const openRejects = await getOpenTaskRejectCount(reportId);
  if (!comment && openRejects === 0)
    return badRequest("반려 사유를 입력하거나 업무 행을 먼저 반려해 주세요.");

  try {
    await rejectReport(reportId, user.id, comment, target);
    // 반려 → 직원에게 알림(행 반려는 이 회신에 번들). best-effort
    await notifyRejected(owner, reportId, comment);
    revalidatePath("/report/[date]", "page");
    revalidatePath("/reports");
    revalidatePath("/review");
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_PENDING") return conflict("검수 대기 상태의 보고서만 반려할 수 있습니다.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
