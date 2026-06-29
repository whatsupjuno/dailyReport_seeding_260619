"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { monthDayKo, todayKstISO } from "@/lib/date";

// 운영 빌드에선 개발 전용 OTP 노출('인증번호 받기'/devOtp)을 숨긴다(고정 코드 운영).
// process.env.NODE_ENV는 클라이언트 번들에 빌드타임 치환됨.
const IS_DEV = process.env.NODE_ENV !== "production";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);
  // 로그인 후 이동 대상(오늘 KST 보고서)과 동일한 날짜를 배너에 표시. 리다이렉트는 /api/auth/login의 todayKstISO()와 일치.
  const [bannerDate] = useState(() => monthDayKo(todayKstISO()));

  const otpStr = otp.join("");
  const ready = loginId.trim().length > 0 && otpStr.length === 4;
  // 에러 시 아이디 입력 빨간 테두리: 아이디가 비었거나 '존재하지 않는 아이디' 오류일 때(디자인 idBorder).
  const idInvalid = !!error && (loginId.trim() === "" || error.includes("존재하지 않는 아이디"));

  function setDigit(i: number, v: string) {
    const digits = v.replace(/\D/g, "");
    if (digits.length > 1) {
      const next = ["", "", "", ""];
      digits
        .slice(0, 4)
        .split("")
        .forEach((d, k) => (next[k] = d));
      setOtp(next);
      boxes.current[Math.min(digits.length, 3)]?.focus();
      setError(null);
      return;
    }
    const next = otp.slice();
    next[i] = digits;
    setOtp(next);
    setError(null);
    if (digits && i < 3) boxes.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !otp[i] && i > 0) boxes.current[i - 1]?.focus();
  }

  async function requestOtp() {
    if (!loginId.trim()) {
      setError("아이디를 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim() }),
      });
      const data = await res.json();
      setSent(true);
      setDevOtp(data.devOtp ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!ready) {
      setError("아이디와 인증번호 4자리를 모두 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim(), otp: otpStr }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "로그인에 실패했습니다.");
        setOtp(["", "", "", ""]);
        boxes.current[0]?.focus();
        return;
      }
      router.push(data.redirect ?? "/");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 16px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 400 }}>
        <div
          style={{
            background: "#fff",
            borderRadius: 16,
            boxShadow: "0 1px 3px rgba(16,24,40,.08), 0 1px 2px rgba(16,24,40,.04)",
            padding: 32,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 26 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                background: "#3B5BDB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 6.5h12M4 10h12M4 13.5h7" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "24px" }}>Seeding</div>
              <div style={{ fontSize: 12, lineHeight: "18px", color: "#6B7280" }}>
                What The Hell Are You Doing?
              </div>
            </div>
          </div>

          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: "36px", marginBottom: 6 }}>로그인</div>
          <div style={{ fontSize: 14, lineHeight: "22px", color: "#6B7280", marginBottom: 22 }}>
            아이디와 인증번호 4자리를 입력해 주세요.
          </div>

          {/* 로그인 후 이동 안내 배너(파란 left-border 카드) */}
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "flex-start",
              background: "#EEF2FF",
              borderLeft: "3px solid #3B5BDB",
              borderRadius: 8,
              padding: "12px 14px",
              marginBottom: 22,
            }}
            data-testid="login-banner"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" style={{ flex: "none", marginTop: 1 }} aria-hidden>
              <circle cx="10" cy="10" r="8" stroke="#3B5BDB" strokeWidth="1.5" />
              <path d="M10 9v5M10 6.2v.2" stroke="#3B5BDB" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <div style={{ fontSize: 13, lineHeight: "19px", color: "#2F49B0" }}>
              로그인하면 <strong style={{ fontWeight: 700 }} suppressHydrationWarning>{bannerDate} 업무 보고서</strong>로 바로 이동합니다.
            </div>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                display: "flex",
                gap: 8,
                alignItems: "flex-start",
                background: "#FCEBEB",
                border: "1px solid #F5C2C2",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 18,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" style={{ flex: "none", marginTop: 1 }} aria-hidden>
                <path d="M10 2.5 18 17H2L10 2.5Z" stroke="#DC2626" strokeWidth="1.5" strokeLinejoin="round" />
                <path d="M10 8v3.5M10 14v.2" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 13, lineHeight: "19px", color: "#DC2626", fontWeight: 600 }}>
                {error}
              </span>
            </div>
          )}

          <div style={{ marginBottom: 18 }}>
            <label
              htmlFor="login-id"
              style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 7 }}
            >
              아이디 <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              id="login-id"
              type="text"
              value={loginId}
              onChange={(e) => {
                setLoginId(e.target.value);
                setError(null);
              }}
              autoComplete="username"
              placeholder="사번 또는 아이디 입력"
              className="login-id-input"
              style={{
                width: "100%",
                height: 48,
                border: `1px solid ${idInvalid ? "#DC2626" : "#CBD0D9"}`,
                borderRadius: 8,
                padding: "0 12px",
                fontFamily: "inherit",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 7,
              }}
            >
              <label style={{ fontSize: 14, fontWeight: 600 }}>
                인증번호 <span style={{ color: "#DC2626" }}>*</span>
              </label>
              {IS_DEV ? (
                <button
                  type="button"
                  onClick={requestOtp}
                  disabled={loading}
                  style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 12,
                    fontWeight: 600,
                    color: "#3B5BDB",
                  }}
                >
                  {sent ? "인증번호 다시 보기" : "인증번호 받기"}
                </button>
              ) : (
                <span style={{ fontSize: 12, color: "#6B7280" }}>관리자에게 발급받은 4자리</span>
              )}
            </div>
            <div role="group" aria-label="인증번호 4자리" style={{ display: "flex", gap: 10 }}>
              {otp.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxes.current[i] = el;
                  }}
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKey(i, e)}
                  aria-label={`인증번호 ${i + 1}번째 자리`}
                  className="tnum otp-box"
                  style={{
                    width: "100%",
                    height: 56,
                    textAlign: "center",
                    border: `1.5px solid ${d ? "#3B5BDB" : "#CBD0D9"}`,
                    borderRadius: 8,
                    fontFamily: "inherit",
                    fontSize: 22,
                    fontWeight: 700,
                    outline: "none",
                  }}
                />
              ))}
            </div>
            {sent && (
              <div style={{ fontSize: 12, color: "#1F9254", marginTop: 8 }} data-testid="otp-sent">
                고정 인증번호를 입력해 주세요.
                {devOtp && (
                  <span data-testid="dev-otp" style={{ color: "#9AA1AE" }}>
                    {" "}
                    (인증번호: {devOtp})
                  </span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={submit}
            disabled={loading}
            style={{
              width: "100%",
              height: 48,
              border: "none",
              borderRadius: 8,
              background: ready ? "#3B5BDB" : "#E2E5EB",
              color: ready ? "#fff" : "#9AA1AE",
              fontFamily: "inherit",
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "wait" : ready ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              transition: "background .15s ease",
            }}
          >
            {loading && (
              <span
                aria-hidden
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid rgba(255,255,255,.5)",
                  borderTopColor: "#fff",
                  borderRadius: 9999,
                  display: "inline-block",
                  animation: "spin .7s linear infinite",
                }}
              />
            )}
            {loading ? "로그인 중…" : "로그인"}
          </button>

          <div
            style={{
              fontSize: 12,
              lineHeight: "18px",
              color: "#6B7280",
              marginTop: 16,
              textAlign: "center",
            }}
          >
            인증번호는 관리자에게 발급받은 고정 코드입니다. (OTP 자동 발급은 추후 제공)
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3B5BDB" }}>
              로그인이 어려우신가요? 관리자에게 문의하세요.
            </span>
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#9AA1AE", marginTop: 20 }}>
          © 2026 Seeding v1.0
        </div>
      </div>
    </div>
  );
}
