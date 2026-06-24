import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { reorderTasks } from "@/lib/data/report-mutations";

/** '오늘 할 일' 드래그 재정렬 — 본인 보고서만. body: { taskIds: number[] } (새 순서) */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as { taskIds?: unknown };
  const raw = Array.isArray(body.taskIds) ? body.taskIds : [];
  const taskIds = raw.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
  if (taskIds.length === 0) return badRequest("정렬할 업무가 없습니다.");

  try {
    await reorderTasks(reportId, taskIds);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    if (m === "NOT_EDITABLE") return conflict("제출된 보고서는 순서를 변경할 수 없습니다.");
    throw e;
  }
}
