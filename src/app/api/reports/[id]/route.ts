import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { saveDraft } from "@/lib/data/report-mutations";

/** 임시저장 — 일일코멘트/야간사유/커뮤없음 플래그 저장(전이 없음) */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    dailyComment?: string;
    nightReason?: string;
    noCommunication?: boolean;
  };
  try {
    await saveDraft(reportId, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "LOCKED_SECTION")
      return badRequest("제출된 보고서는 임시저장할 수 없습니다.");
    throw e;
  }
}
