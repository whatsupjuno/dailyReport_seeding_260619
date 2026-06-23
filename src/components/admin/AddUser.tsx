"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddUser({ groups, open, onClose }: { groups: Array<{ id: number; name: string }>; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState<"employee" | "group_leader" | "admin">("employee");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ? String(groups[0].id) : "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  function close() { setCode(""); onClose(); }
  async function submit() {
    if (!name.trim() || !loginId.trim()) { alert("이름과 아이디를 입력해 주세요."); return; }
    if (code && !/^\d{4}$/.test(code)) { alert("인증번호는 숫자 4자리로 입력해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), loginId: loginId.trim(), role, groupId: groupId ? Number(groupId) : null, loginCode: code || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(data.error ?? "추가 실패"); return; }
      setName(""); setLoginId(""); setCode(""); onClose();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 };
  const field: React.CSSProperties = { width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const cell: React.CSSProperties = { flex: 1, minWidth: 160 };

  if (!open) return null;

  return (
    <div style={{ width: "100%", border: "1px solid #CBD0D9", borderRadius: 12, background: "#FBFCFD", padding: "16px 18px", marginBottom: 16 }} data-testid="add-user-form">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>사용자 추가</div>

      {/* 1행: 이름 · 아이디 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={cell}>
          <label style={label}>이름 <span style={{ color: "#DC2626" }}>*</span></label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" data-testid="user-name" style={field} />
        </div>
        <div style={cell}>
          <label style={label}>아이디 <span style={{ color: "#DC2626" }}>*</span></label>
          <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="사번 또는 아이디" data-testid="user-loginid" style={field} />
        </div>
      </div>

      {/* 2행: 소속 그룹 · 역할 */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={cell}>
          <label style={label}>소속 그룹</label>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} data-testid="user-group" style={{ ...field, padding: "0 10px", color: "#3A4150", background: "#fff", cursor: "pointer" }}>
            <option value="">소속 없음</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div style={cell}>
          <label style={label}>역할</label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} data-testid="user-role" style={{ ...field, padding: "0 10px", color: "#3A4150", background: "#fff", cursor: "pointer" }}>
            <option value="employee">직원</option>
            <option value="group_leader">그룹장</option>
            <option value="admin">관리자</option>
          </select>
        </div>
      </div>

      {/* 3행: 인증번호(로그인 코드) */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 12 }}>
        <div style={cell}>
          <label style={label}>인증번호 <span style={{ fontWeight: 500, color: "#9AA1AE" }}>(로그인 코드)</span></label>
          <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="숫자 4자리 (미입력 시 1234)" data-testid="user-code" style={{ ...field, letterSpacing: code ? 2 : 0 }} />
        </div>
        <div style={{ ...cell, display: "flex", alignItems: "flex-end" }}>
          <div style={{ fontSize: 12, color: "#9AA1AE", lineHeight: "18px", paddingBottom: 11 }}>로그인 시 사용하는 4자리 인증번호입니다. 보고 안내 메일로 안내됩니다.</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button onClick={close} style={{ height: 38, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
        <button onClick={submit} disabled={busy} data-testid="add-user-submit" style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>저장</button>
      </div>
    </div>
  );
}
