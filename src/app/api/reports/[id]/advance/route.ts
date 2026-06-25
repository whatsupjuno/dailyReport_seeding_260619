import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { advanceReport, type AdvanceInput } from "@/lib/data/report-mutations";
import { getReviewOwner } from "@/lib/data/review";
import { notifyLeaderReview } from "@/lib/mail/notify";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as AdvanceInput;
  if (body.nightBranch === "yes" && !body.nightReason?.trim())
    return badRequest("야간 업무 사유를 입력해 주세요.");
  if ((body.dailyComment?.length ?? 0) > 10000) return badRequest("일일 코멘트는 최대 10,000자입니다.");
  if ((body.nightReason?.length ?? 0) > 10000) return badRequest("야간 사유는 최대 10,000자입니다.");

  try {
    const res = await advanceReport(reportId, body);
    // 그룹장 알림(반환값 기준, best-effort). 최종/재제출/휴가제출 → 검수요청, 1차 계획제출 → 계획 컨펌요청.
    if (res.submitted === true && res.mode !== "view") {
      const owner = await getReviewOwner(reportId);
      if (owner) await notifyLeaderReview(owner, reportId, res.mode === "rejected" ? "resubmit_review" : "review_request");
    } else if (res.mode === "work" && res.status === "계획제출") {
      // 1차 계획 제출 → 그룹장에게 '계획이 제출됨, 1차 컨펌/계획 반려 필요'(D4: 발송)
      const owner = await getReviewOwner(reportId);
      if (owner) await notifyLeaderReview(owner, reportId, "plan_review_request");
    }
    return NextResponse.json({ ok: true, ...res });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "VACATION_NOT_ALLOWED") return conflict("이미 진행된 보고서는 휴가로 전환할 수 없습니다.");
    if (m === "VACATION_REASON_REQUIRED") return badRequest("선택한 휴가 유형은 사유가 필수입니다.");
    if (m === "REASON_TOO_LONG") return badRequest("사유는 최대 10,000자까지 입력할 수 있습니다.");
    if (m === "NIGHT_REASON_REQUIRED") return badRequest("야간 업무 사유를 입력해 주세요.");
    if (m === "EMPTY_PLAN") return badRequest("계획을 제출하려면 업무를 1개 이상 추가해 주세요.");
    if (m === "STALE_STATE") return conflict("보고서 상태가 변경되었습니다. 새로고침 후 다시 시도해 주세요.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
