"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import AddUser from "./AddUser";

type U = { id: number; name: string; login_id: string; role: string; group_id: number | null; group_name: string | null; active: boolean; report_required: boolean };

const ROLES: Array<["employee" | "group_leader" | "admin", string]> = [["employee", "직원"], ["group_leader", "그룹장"], ["admin", "관리자"]];
const ROLE_BADGE: Record<string, [string, string]> = { admin: ["#2F49B0", "#EEF2FF"], group_leader: ["#7A5B00", "#FBF4DA"], employee: ["#3A4150", "#F1F2F4"] };
const ROLE_LABEL: Record<string, string> = { employee: "직원", group_leader: "그룹장", admin: "관리자" };

export default function UsersAdmin({ users, groups }: { users: U[]; groups: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<U | null>(null);
  const [eName, setEName] = useState("");
  const [eRole, setERole] = useState<"employee" | "group_leader" | "admin">("employee");
  const [eGroup, setEGroup] = useState("");
  const [eActive, setEActive] = useState(true);
  const [busy, setBusy] = useState(false);

  function openEdit(u: U) {
    setEdit(u);
    setEName(u.name);
    setERole(u.role as "employee" | "group_leader" | "admin");
    setEGroup(u.group_id ? String(u.group_id) : "");
    setEActive(u.active);
  }
  async function save() {
    if (!edit || !eName.trim()) { alert("이름을 입력해 주세요."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${edit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: eName.trim(), role: eRole, groupId: eGroup ? Number(eGroup) : null, active: eActive }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { alert(d.error ?? "수정에 실패했습니다."); return; }
      setEdit(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const filtered = users.filter((u) => !q.trim() || u.name.includes(q.trim()) || u.login_id.includes(q.trim()));
  const inp: React.CSSProperties = { width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#3A4150" }}>총 <span className="tnum">{users.length}</span>명</span>
        <div style={{ flex: 1, minWidth: 160, position: "relative", display: "flex", alignItems: "center" }}>
          <span aria-hidden style={{ position: "absolute", left: 12, color: "#9AA1AE", fontSize: 14, pointerEvents: "none" }}>🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·아이디로 검색" aria-label="이름·아이디로 검색" data-testid="admin-user-search" style={{ width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px 0 34px", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
        </div>
        {!addOpen && <button onClick={() => setAddOpen(true)} data-testid="add-user-open" style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ 사용자 추가</button>}
      </div>

      <AddUser groups={groups} open={addOpen} onClose={() => setAddOpen(false)} />

      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }} data-testid="admin-users-table">
        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "11px 18px", background: "#F7F8FA", borderBottom: "1px solid #E2E5EB", fontSize: 12, fontWeight: 600, color: "#6B7280" }}>
          <span style={{ flex: 1 }}>이름 · 아이디</span>
          <span style={{ width: 200 }}>소속 그룹 · 상태</span>
          <span style={{ width: 70 }}>역할</span>
          <span style={{ width: 124, textAlign: "right" }}>작업</span>
        </div>
        {filtered.map((u) => {
          const [fg, bg] = ROLE_BADGE[u.role] ?? ROLE_BADGE.employee;
          return (
            <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 16, padding: "13px 18px", borderTop: "1px solid #F2F3F6" }} data-testid="admin-user-row">
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ width: 34, height: 34, borderRadius: 9999, flex: "none", background: "#EDEFF5", color: "#5B6678", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{u.name.slice(0, 1)}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1F2B" }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{u.login_id}</div>
                </div>
              </div>
              <div style={{ width: 200, fontSize: 13, color: "#3A4150", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span>{u.group_name ?? "—"} · <span style={{ color: u.active ? "#1F9254" : "#9AA1AE", fontWeight: 600 }}>{u.active ? "활성" : "비활성"}</span></span>
                {!u.report_required && <span data-testid="report-excluded-badge" style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 9999, color: "#8A6508", background: "#FBF4DA", border: "1px solid #EFE0A6" }}>작성 제외</span>}
              </div>
              <div style={{ width: 70 }}><span style={{ fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 9999, color: fg, background: bg }}>{ROLE_LABEL[u.role]}</span></div>
              <div style={{ width: 124, textAlign: "right", display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Link href={`/admin/users/${u.id}`} data-testid={`admin-user-profile-${u.id}`} style={{ height: 30, lineHeight: "28px", padding: "0 12px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, textDecoration: "none" }}>프로필</Link>
                <button onClick={() => openEdit(u)} data-testid={`admin-user-edit-${u.id}`} style={{ height: 30, padding: "0 12px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>수정</button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#9AA1AE", fontSize: 13 }}>검색 결과가 없습니다.</div>}
      </div>

      {edit && (
        <div onClick={() => setEdit(null)} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="admin-edit-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 440, padding: "20px 22px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>사용자 수정</div>
            <div style={{ fontSize: 12, color: "#9AA1AE", marginBottom: 16 }} className="tnum">{edit.login_id}</div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>이름</label>
            <input value={eName} onChange={(e) => setEName(e.target.value)} data-testid="admin-edit-name" style={inp} />
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>소속 그룹</label>
                <select value={eGroup} onChange={(e) => setEGroup(e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  <option value="">소속 없음</option>
                  {groups.map((g) => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>역할</label>
                <select value={eRole} onChange={(e) => setERole(e.target.value as "employee" | "group_leader" | "admin")} data-testid="admin-edit-role" style={{ ...inp, cursor: "pointer" }}>
                  {ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={eActive} onChange={(e) => setEActive(e.target.checked)} data-testid="admin-edit-active" />
              <span style={{ fontSize: 13, color: "#3A4150" }}>활성 계정 <span style={{ color: "#9AA1AE" }}>(비활성 시 즉시 로그아웃됩니다)</span></span>
            </label>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEdit(null)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={save} disabled={busy} data-testid="admin-edit-save" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
