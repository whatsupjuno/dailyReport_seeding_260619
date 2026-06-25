import { NextResponse } from "next/server";
import { apiUser, badRequest, conflict, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { deleteGroup, updateGroup } from "@/lib/data/admin";

/** 그룹 정보 수정(이름·그룹장) — 관리자 전용 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  const body = (await req.json().catch(() => ({}))) as { name?: string; leaderId?: number | null };
  if (!body.name?.trim()) return badRequest("그룹명을 입력해 주세요.");

  try {
    await updateGroup(groupId, { name: body.name.trim(), leaderId: body.leaderId ?? null });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "DUPLICATE_NAME") return conflict("이미 사용 중인 그룹명입니다.");
    if (m === "NAME_REQUIRED") return badRequest("그룹명을 입력해 주세요.");
    if (m === "NOT_FOUND") return badRequest("그룹을 찾을 수 없습니다.");
    if (m === "LEADER_NOT_ACTIVE") return badRequest("비활성 사용자는 그룹장으로 지정할 수 없습니다.");
    throw e;
  }
}

/** 그룹 삭제 — 관리자 전용. 구성원은 소속 없음으로 전환(데이터 보존). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  try {
    await deleteGroup(groupId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "NOT_FOUND") return badRequest("그룹을 찾을 수 없습니다.");
    throw e;
  }
}
