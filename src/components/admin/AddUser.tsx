"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AddUser({ groups }: { groups: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [loginId, setLoginId] = useState("");
  const [role, setRole] = useState<"employee" | "group_leader" | "admin">("employee");
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ? String(groups[0].id) : "");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !loginId.trim()) { alert("이름과 아이디를 입력해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, loginId, role, groupId: groupId ? Number(groupId) : null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { alert(data.error ?? "추가 실패"); return; }
      setName(""); setLoginId(""); setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inp: React.CSSProperties = { height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, background: "#fff" };

  if (!open)
    return (
      <button onClick={() => setOpen(true)} data-testid="add-user-open" style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ 사용자 추가</button>
    );

  return (
    <div style={{ border: "1px solid #CBD0D9", borderRadius: 12, background: "#FBFCFD", padding: "16px 18px", marginBottom: 16 }} data-testid="add-user-form">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>사용자 추가</div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="이름" data-testid="user-name" style={{ ...inp, flex: 1, minWidth: 140 }} />
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="사번 또는 아이디" data-testid="user-loginid" style={{ ...inp, flex: 1, minWidth: 140 }} />
        <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} style={{ ...inp, minWidth: 120 }}>
          <option value="employee">직원</option>
          <option value="group_leader">그룹장</option>
          <option value="admin">관리자</option>
        </select>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...inp, minWidth: 120 }}>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={() => setOpen(false)} style={{ height: 38, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
        <button onClick={submit} disabled={busy} data-testid="add-user-submit" style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>저장</button>
      </div>
    </div>
  );
}
