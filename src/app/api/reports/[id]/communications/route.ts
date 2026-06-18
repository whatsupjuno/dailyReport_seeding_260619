import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getReportOwnerId } from "@/lib/data/reports";
import { addCommunication } from "@/lib/data/report-mutations";

const TYPES = ["통화", "메일", "회의", "카톡", "구두"];

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
    type?: string;
    counterpart?: string;
    time?: string;
    summary?: string;
  };
  const type = TYPES.includes(body.type ?? "") ? (body.type as string) : null;
  if (!type) return badRequest("커뮤니케이션 유형을 선택해 주세요.");
  if (!body.counterpart?.trim()) return badRequest("상대를 입력해 주세요.");
  if (!body.summary?.trim()) return badRequest("요약을 입력해 주세요.");

  try {
    const res = await addCommunication(reportId, {
      type,
      counterpart: body.counterpart.trim(),
      time: body.time?.trim() || null,
      summary: body.summary.trim(),
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    if ((e as Error).message === "LOCKED_SECTION")
      return badRequest("제출된 보고서에는 추가할 수 없습니다.");
    throw e;
  }
}
