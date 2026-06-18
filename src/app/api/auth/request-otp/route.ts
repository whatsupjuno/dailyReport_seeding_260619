import { NextResponse } from "next/server";
import { requestOtp } from "@/lib/auth/service";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { loginId?: string };
  const loginId = (body.loginId ?? "").trim();
  if (!loginId) return NextResponse.json({ ok: false, error: "아이디를 입력해 주세요." }, { status: 400 });
  const result = await requestOtp(loginId);
  return NextResponse.json(result);
}
