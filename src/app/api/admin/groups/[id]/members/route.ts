import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { addGroupMember, removeGroupMember } from "@/lib/data/admin";

/** 구성원 추가(이동) — 관리자 전용. body: { userId } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  // id는 bigint → 클라이언트에서 number/numeric-string 어느 쪽으로 와도 허용
  const raw = (await req.json().catch(() => ({}))) as { userId?: number | string };
  const userId =
    typeof raw.userId === "number" && Number.isInteger(raw.userId) ? raw.userId : parseId(String(raw.userId ?? ""));
  if (userId == null || userId <= 0) return badRequest("추가할 사용자를 선택해 주세요.");

  try {
    await addGroupMember(groupId, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "GROUP_NOT_FOUND") return badRequest("그룹을 찾을 수 없습니다.");
    if (m === "USER_NOT_FOUND") return badRequest("사용자를 찾을 수 없습니다.");
    throw e;
  }
}

/** 구성원 제거 — 관리자 전용. ?userId=N (DELETE 본문 의존 회피). */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const groupId = parseId(id);
  if (groupId == null) return badRequest("잘못된 그룹 ID입니다.");

  const raw = new URL(req.url).searchParams.get("userId") ?? "";
  const userId = parseId(raw);
  if (userId == null) return badRequest("제거할 사용자를 선택해 주세요.");

  await removeGroupMember(groupId, userId);
  return NextResponse.json({ ok: true });
}
