import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import {
  carryoverIncomplete,
  carryoverSelected,
  listCarryoverCandidates,
} from "@/lib/data/report-mutations";

/** 미완료 업무 불러오기 — 후보 목록(팝업에서 선택용) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();
  const candidates = await listCarryoverCandidates(reportId);
  return NextResponse.json({ candidates });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const reportId = parseId(id);
  if (reportId == null) return badRequest("잘못된 보고서 ID입니다.");
  const owner = await getReportOwnerId(reportId);
  if (owner == null) return badRequest("보고서를 찾을 수 없습니다.");
  if (owner !== user.id) return forbidden();

  // body.taskIds가 있으면 선택 이월, 없으면(하위호환) 전체 이월
  const body = (await req.json().catch(() => ({}))) as { taskIds?: unknown };
  const hasSelection = Array.isArray(body.taskIds);
  const taskIds = hasSelection
    ? (body.taskIds as unknown[]).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0)
    : [];

  try {
    const res = hasSelection
      ? await carryoverSelected(reportId, taskIds)
      : await carryoverIncomplete(reportId);
    return NextResponse.json({ ok: true, count: res.count });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "LOCKED") return badRequest("제출된 보고서에는 불러올 수 없습니다.");
    if (m === "NOT_FOUND") return badRequest("보고서를 찾을 수 없습니다.");
    throw e;
  }
}
