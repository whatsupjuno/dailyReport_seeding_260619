import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { advanceReport, type AdvanceInput } from "@/lib/data/report-mutations";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = Number(id);
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as AdvanceInput;
  if (body.nightBranch === "yes" && !body.nightReason?.trim())
    return badRequest("야간 업무 사유를 입력해 주세요.");

  const res = await advanceReport(reportId, body);
  return NextResponse.json({ ok: true, ...res });
}
