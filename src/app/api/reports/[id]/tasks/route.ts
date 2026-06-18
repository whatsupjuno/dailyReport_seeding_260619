import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { addTask } from "@/lib/data/report-mutations";
import type { SectionKind } from "@/lib/domain/status";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = Number(id);
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    sectionKind?: SectionKind;
    title?: string;
    project?: string;
    plannedStart?: string;
    plannedDurationMin?: number;
  };
  if (!body.title?.trim()) return badRequest("업무명을 입력해 주세요.");
  if (!body.sectionKind) return badRequest("시간대가 필요합니다.");

  try {
    const res = await addTask(reportId, {
      sectionKind: body.sectionKind,
      title: body.title.trim(),
      project: body.project?.trim() || null,
      plannedStart: body.plannedStart || null,
      plannedDurationMin: body.plannedDurationMin ?? null,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    if ((e as Error).message === "LOCKED_SECTION")
      return badRequest("마감된 시간대에는 업무를 추가할 수 없습니다.");
    throw e;
  }
}
