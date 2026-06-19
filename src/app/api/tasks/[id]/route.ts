import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getTaskOwner } from "@/lib/data/reports";
import { updateTask } from "@/lib/data/report-mutations";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");
  const owner = await getTaskOwner(taskId);
  if (!owner) return badRequest("업무를 찾을 수 없습니다.");
  if (owner.user_id !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    status?: string;
    holdReason?: string | null;
    actualMin?: number | null;
  };
  try {
    await updateTask(owner.report_id, taskId, {
      status: body.status,
      holdReason: body.holdReason ?? null,
      actualMin: body.actualMin ?? null,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "LOCKED_TASK") return badRequest("제출된 보고서의 업무는 변경할 수 없습니다.");
    if (m === "BAD_STATUS") return badRequest("완결/지연은 '마감'으로 처리해 주세요.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}
