"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  const otpStr = otp.join("");
  const ready = loginId.trim().length > 0 && otpStr.length === 4;

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

          {error && (
            <div
              role="alert"
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
              style={{
                width: "100%",
                height: 48,
                border: "1px solid #CBD0D9",
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
                {sent ? "인증번호 재발송" : "인증번호 받기"}
              </button>
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
                  className="tnum"
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
                인증번호를 메일로 보냈어요.
                {devOtp && (
                  <span data-testid="dev-otp" style={{ color: "#9AA1AE" }}>
                    {" "}
                    (개발용: {devOtp})
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
              cursor: loading ? "wait" : "pointer",
            }}
          >
            {loading ? "처리 중…" : "로그인"}
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
            인증번호는 발송된 보고 안내 메일에서 확인할 수 있습니다.
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, color: "#9AA1AE", marginTop: 20 }}>
          © 2026 Seeding v1.0
        </div>
      </div>
    </div>
  );
}
