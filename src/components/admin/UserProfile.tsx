"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export interface ProfileUser {
  id: number;
  name: string;
  login_id: string;
  email: string;
  role: "employee" | "group_leader" | "admin";
  group_id: number | null;
  group_name: string | null;
  active: boolean;
  report_required: boolean;
}

const ROLE_LABEL: Record<string, string> = { employee: "직원", group_leader: "그룹장", admin: "관리자" };

export default function UserProfile({ user }: { user: ProfileUser }) {
  const router = useRouter();
  const [reportRequired, setReportRequired] = useState(user.report_required);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const dirty = reportRequired !== user.report_required;
  const codeValid = /^\d{4}$/.test(code);

  /** 공통 payload — 미변경 필드는 현재 값 그대로 전송(부분 수정 호환) */
  function basePayload() {
    return { name: user.name, role: user.role, groupId: user.group_id, active: user.active };
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), reportRequired }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { alert(d.error ?? "저장에 실패했습니다."); return; }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveCode() {
    if (!codeValid) { alert("인증번호는 숫자 4자리로 입력해 주세요."); return; }
    setCodeBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload(), loginCode: code }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { alert(d.error ?? "인증번호 변경에 실패했습니다."); return; }
      setCode("");
      alert("인증번호를 변경했습니다.");
      router.refresh();
    } finally {
      setCodeBusy(false);
    }
  }

  const initial = user.name.trim().charAt(0) || "?";
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 24px 60px" }}>
      <Link href="/admin/users" style={{ fontSize: 13, fontWeight: 600, color: "#3B5BDB", textDecoration: "none" }}>← 사용자 관리</Link>

      {/* 프로필 헤더 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16, marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 9999, background: "#E0E7FF", color: "#2F49B0", fontSize: 22, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{initial}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{user.name}</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginTop: 2 }}>{user.login_id}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, background: "#EEF2FF", color: "#2F49B0" }}>{ROLE_LABEL[user.role]}</span>
            {user.group_name && <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, background: "#F1F2F4", color: "#3A4150" }}>{user.group_name}</span>}
            <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, background: user.active ? "#E7F5EC" : "#FCEBEB", color: user.active ? "#1F7A46" : "#B91C1C" }}>{user.active ? "활성" : "비활성"}</span>
          </div>
        </div>
      </div>

      {/* 보고서 작성 설정 */}
      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(16,24,40,.08)" }} data-testid="profile-report-card">
        <div style={{ fontSize: 15, fontWeight: 700 }}>보고서 작성 설정</div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1F2B" }}>보고서 작성 대상</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: "19px" }}>
              {reportRequired
                ? "이 사용자는 매일 업무 보고서를 작성하는 대상입니다. 작성 요청(오전 8:30)·미제출 독촉 메일을 받습니다."
                : "작성 대상이 아닙니다. 작성 요청(오전 8:30)·미제출 독촉 등 보고 안내 메일을 보내지 않습니다."}
            </div>
          </div>
          {/* 토글 버튼 */}
          <button
            type="button"
            role="switch"
            aria-checked={reportRequired}
            aria-label="보고서 작성 대상"
            data-testid="report-required-toggle"
            onClick={() => setReportRequired((v) => !v)}
            style={{ flex: "none", width: 50, height: 28, borderRadius: 9999, border: "none", padding: 3, cursor: "pointer", background: reportRequired ? "#3B5BDB" : "#CBD0D9", display: "flex", justifyContent: reportRequired ? "flex-end" : "flex-start", alignItems: "center", transition: "background .15s", WebkitTapHighlightColor: "transparent" }}
          >
            <span style={{ width: 22, height: 22, borderRadius: 9999, background: "#fff", boxShadow: "0 1px 2px rgba(16,24,40,.2)" }} />
          </button>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button onClick={save} disabled={busy || !dirty} data-testid="profile-save" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 8, background: dirty ? "#3B5BDB" : "#E2E5EB", color: dirty ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: dirty && !busy ? "pointer" : "default" }}>저장</button>
        </div>
      </div>

      {/* 로그인 인증번호 */}
      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 20px", boxShadow: "0 1px 3px rgba(16,24,40,.08)", marginTop: 16 }} data-testid="profile-code-card">
        <div style={{ fontSize: 15, fontWeight: 700 }}>로그인 인증번호</div>
        <div style={{ fontSize: 13, color: "#6B7280", marginTop: 4, lineHeight: "19px" }}>이 사용자가 로그인할 때 입력하는 4자리 인증번호입니다. 보안상 현재 인증번호는 표시되지 않으며, 새 4자리를 입력해 변경할 수 있습니다.</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            placeholder="새 인증번호 4자리"
            aria-label="새 인증번호 4자리"
            data-testid="profile-code-input"
            style={{ width: 180, height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 15, letterSpacing: code ? 3 : 0, outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={saveCode} disabled={codeBusy || !codeValid} data-testid="profile-code-save" style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 8, background: codeValid ? "#3B5BDB" : "#E2E5EB", color: codeValid ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: codeValid && !codeBusy ? "pointer" : "default" }}>변경</button>
        </div>
      </div>
    </div>
  );
}
