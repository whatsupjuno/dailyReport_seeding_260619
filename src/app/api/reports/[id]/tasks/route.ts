import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { addTask } from "@/lib/data/report-mutations";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    project?: string;
    plannedStart?: string;
    plannedDurationMin?: number;
    isNight?: boolean;
  };
  if (!body.title?.trim()) return badRequest("업무명을 입력해 주세요.");

  try {
    const res = await addTask(reportId, {
      title: body.title.trim(),
      project: body.project?.trim() || null,
      plannedStart: body.plannedStart || null,
      plannedDurationMin: body.plannedDurationMin ?? null,
      isNight: !!body.isNight,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "LOCKED_TASK") return badRequest("제출된 보고서에는 업무를 추가할 수 없습니다.");
    if (m === "TITLE_REQUIRED") return badRequest("업무명을 입력해 주세요.");
    throw e;
  }
}
