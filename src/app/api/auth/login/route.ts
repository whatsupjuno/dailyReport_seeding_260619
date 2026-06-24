import { NextResponse } from "next/server";
import { verifyOtp } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { rateLimit } from "@/lib/auth/ratelimit";
import { getUserById } from "@/lib/data/users";
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

  // 무차별 대입 완화: loginId+IP 단위 분당 한도
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const rl = rateLimit(`login:${loginId.toLowerCase()}:${ip}`, 20, 5 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { ok: false, error: "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  const result = await verifyOtp(loginId, otp);
  if (!result.ok || !result.userId) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 401 });
  }
  await createSession(result.userId);
  // 작성 대상이 아니면 작성 화면으로 보내지 않음 — 검수자/관리자는 검수, 그 외는 목록으로.
  const u = await getUserById(result.userId);
  const redirect =
    u && !u.report_required
      ? u.role === "group_leader" || u.role === "admin"
        ? "/review"
        : "/reports"
      : `/report/${todayKstISO()}`;
  return NextResponse.json({ ok: true, redirect });
}
