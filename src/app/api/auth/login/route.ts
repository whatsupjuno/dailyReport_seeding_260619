import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { todayKstISO } from "@/lib/date";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { loginId?: string; otp?: string };
  const loginId = (body.loginId ?? "").trim();
  const otp = (body.otp ?? "").trim();
  if (!loginId || otp.length !== 4) {
    return NextResponse.json(
      { ok: false, error: "아이디와 인증번호 4자리를 모두 입력해 주세요." },
      { status: 400 },
    );
  }
  const result = await verifyOtp(loginId, otp);
  if (!result.ok || !result.userId) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  await createSession(result.userId);
  return NextResponse.json({ ok: true, redirect: `/report/${todayKstISO()}` });
}
