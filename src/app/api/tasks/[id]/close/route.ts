import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getTaskOwner } from "@/lib/data/reports";
import { closeTask } from "@/lib/data/report-mutations";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const taskId = parseId(id);
  if (taskId == null) return badRequest("잘못된 업무 ID입니다.");
  const owner = await getTaskOwner(taskId);
  if (!owner) return badRequest("업무를 찾을 수 없습니다.");
  if (owner.user_id !== user.id) return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    doneTime?: string | null;
    holdReason?: string | null;
    ackReject?: boolean;
  };
  try {
    await closeTask(owner.report_id, taskId, {
      doneTime: body.doneTime ?? null,
      holdReason: body.holdReason ?? null,
      ackReject: body.ackReject,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "LOCKED_TASK") return badRequest("제출된 보고서의 업무는 변경할 수 없습니다.");
    if (m === "HAS_OPEN_REJECT") return conflict("검수자가 이 업무를 반려했어요. 새로고침 후 반려 사유를 확인해 주세요.");
    if (m === "BAD_TIME") return badRequest("마감 시각 형식이 올바르지 않습니다.");
    if (m === "NOT_FOUND") return badRequest("업무를 찾을 수 없습니다.");
    throw e;
  }
}
