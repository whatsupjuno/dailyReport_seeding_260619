import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { getCommOwner } from "@/lib/data/reports";
import { deleteCommunication } from "@/lib/data/report-mutations";

/** 커뮤니케이션 기록 삭제 */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const commId = parseId(id);
  if (commId == null) return badRequest("잘못된 커뮤니케이션 ID입니다.");
  const owner = await getCommOwner(commId);
  if (!owner) return badRequest("커뮤니케이션을 찾을 수 없습니다.");
  if (owner.user_id !== user.id) return forbidden();
  try {
    await deleteCommunication(commId, user.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "FORBIDDEN") return forbidden();
    if (m === "NOT_FOUND") return badRequest("커뮤니케이션을 찾을 수 없습니다.");
    if (m === "LOCKED_SECTION") return conflict("제출된 보고서의 기록은 삭제할 수 없습니다.");
    throw e;
  }
}
