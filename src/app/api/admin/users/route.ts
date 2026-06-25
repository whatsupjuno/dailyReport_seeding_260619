import { NextResponse } from "next/server";
import { apiUser, badRequest, forbidden, unauthorized } from "@/lib/auth/api";
import { createUser, isValidEmail, resolveEmail } from "@/lib/data/admin";

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
  // 이메일은 항상 유효 형식만 저장(이중 @ 등 차단). 미입력 시 아이디로 도출.
  const email = resolveEmail(body.loginId.trim(), body.email);
  if (!isValidEmail(email)) return badRequest("올바른 이메일 형식이 아닙니다. (예: name@company.com)");

  try {
    const res = await createUser({
      name: body.name.trim(),
      loginId: body.loginId.trim(),
      email,
      role: body.role ?? "employee",
      groupId: body.groupId ?? null,
      loginCode: loginCode || undefined,
    });
    return NextResponse.json({ ok: true, id: res.id });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "DUPLICATE_LOGIN_ID") return badRequest("이미 사용 중인 아이디입니다.");
    if (m === "INVALID_CODE") return badRequest("인증번호는 숫자 4자리로 입력해 주세요.");
    if (m === "INVALID_EMAIL") return badRequest("올바른 이메일 형식이 아닙니다.");
    throw e;
  }
}
