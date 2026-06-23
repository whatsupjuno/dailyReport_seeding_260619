import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, parseId, unauthorized } from "@/lib/auth/api";
import { updateUser } from "@/lib/data/admin";

/** 사용자 수정 — 관리자 전용 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();
  const { id } = await ctx.params;
  const userId = parseId(id);
  if (userId == null) return badRequest("잘못된 사용자 ID입니다.");

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    role?: "employee" | "group_leader" | "admin";
    groupId?: number | null;
    active?: boolean;
    reportRequired?: boolean;
    loginCode?: string;
  };
  if (!body.name?.trim()) return badRequest("이름을 입력해 주세요.");
  const loginCode = body.loginCode?.trim();
  if (loginCode && !/^\d{4}$/.test(loginCode)) return badRequest("인증번호는 숫자 4자리로 입력해 주세요.");

  try {
    await updateUser(userId, {
      name: body.name.trim(),
      role: body.role ?? "employee",
      groupId: body.groupId ?? null,
      active: body.active ?? true,
      reportRequired: typeof body.reportRequired === "boolean" ? body.reportRequired : undefined,
      loginCode: loginCode || undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "NAME_REQUIRED") return badRequest("이름을 입력해 주세요.");
    if (m === "NOT_FOUND") return badRequest("사용자를 찾을 수 없습니다.");
    if (m === "INVALID_CODE") return badRequest("인증번호는 숫자 4자리로 입력해 주세요.");
    throw e;
  }
}
