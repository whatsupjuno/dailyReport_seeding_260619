import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { carryoverIncomplete } from "@/lib/data/report-mutations";
import type { SectionKind } from "@/lib/domain/status";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { sectionKind?: SectionKind };
  if (!body.sectionKind) return badRequest("시간대가 필요합니다.");

  try {
    const res = await carryoverIncomplete(reportId, body.sectionKind);
    return NextResponse.json({ ok: true, count: res.count });
  } catch (e) {
    if ((e as Error).message === "LOCKED") return badRequest("마감된 시간대에는 불러올 수 없습니다.");
    throw e;
  }
}
