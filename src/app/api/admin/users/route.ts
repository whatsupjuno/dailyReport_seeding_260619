import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { createUser } from "@/lib/data/admin";

export async function POST(req: Request) {
  const user = await apiUser();
  if (!user) return unauthorized();
  if (user.role !== "admin") return forbidden();

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    loginId?: string;
    email?: string;
    role?: "employee" | "group_leader" | "admin";
    groupId?: number | null;
    loginCode?: string;
  };
  if (!body.name?.trim() || !body.loginId?.trim()) return badRequest("이름과 아이디를 입력해 주세요.");
  const loginCode = body.loginCode?.trim();
  if (loginCode && !/^\d{4}$/.test(loginCode)) return badRequest("인증번호는 숫자 4자리로 입력해 주세요.");

  try {
    const res = await createUser({
      name: body.name.trim(),
      loginId: body.loginId.trim(),
      email: body.email?.trim() || `${body.loginId.trim()}@company.com`,
      role: body.role ?? "employee",
      groupId: body.groupId ?? null,
      loginCode: loginCode || undefined,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "DUPLICATE_LOGIN_ID") return badRequest("이미 사용 중인 아이디입니다.");
    if (m === "INVALID_CODE") return badRequest("인증번호는 숫자 4자리로 입력해 주세요.");
    throw e;
  }
}
