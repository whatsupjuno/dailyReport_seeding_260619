import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getTaskOwner } from "@/lib/data/reports";
import { reopenTask } from "@/lib/data/report-mutations";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");
  const owner = await getTaskOwner(taskId);
  if (!owner) return badRequest("업무를 찾을 수 없습니다.");
  if (owner.user_id !== user.id) return forbidden();

  try {
    await reopenTask(owner.report_id, taskId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "LOCKED_TASK") return badRequest("제출된 보고서의 업무는 변경할 수 없습니다.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}
