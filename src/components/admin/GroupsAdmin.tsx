"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { id: number; name: string };
export type AdminGroup = { id: number; name: string; leader_id: number | null; leader_name: string | null; members: Member[] };
export type BriefUser = { id: number; name: string; login_id: string; group_id: number | null; group_name: string | null };

export default function GroupsAdmin({ groups, users }: { groups: AdminGroup[]; users: BriefUser[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // 그룹 생성
  const [createOpen, setCreateOpen] = useState(false);
  const [cName, setCName] = useState("");

  // 그룹 수정
  const [editId, setEditId] = useState<number | null>(null);
  const [eName, setEName] = useState("");
  const [eLeader, setELeader] = useState(""); // userId 문자열 또는 ""

  // 구성원 추가 모달
  const [memberForId, setMemberForId] = useState<number | null>(null);
  const [memberQ, setMemberQ] = useState("");

  const editGroup = editId == null ? null : groups.find((g) => g.id === editId) ?? null;
  const memberGroup = memberForId == null ? null : groups.find((g) => g.id === memberForId) ?? null;

  async function send(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) { alert(d.error ?? "처리에 실패했습니다."); return false; }
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    if (!cName.trim()) { alert("그룹명을 입력해 주세요."); return; }
    const ok = await send("/api/admin/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: cName.trim() }),
    });
    if (ok) { setCName(""); setCreateOpen(false); }
  }

  function openEdit(g: AdminGroup) {
    setEditId(g.id);
    setEName(g.name);
    setELeader(g.leader_id ? String(g.leader_id) : "");
  }
  async function saveEdit() {
    if (editId == null) return;
    if (!eName.trim()) { alert("그룹명을 입력해 주세요."); return; }
    const ok = await send(`/api/admin/groups/${editId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: eName.trim(), leaderId: eLeader ? Number(eLeader) : null }),
    });
    if (ok) setEditId(null);
  }
  async function deleteGroup(g: AdminGroup) {
    if (!confirm(`'${g.name}' 그룹을 삭제할까요?\n구성원 ${g.members.length}명은 '소속 없음'으로 바뀝니다.`)) return;
    await send(`/api/admin/groups/${g.id}`, { method: "DELETE" });
  }
  async function addMember(groupId: number, userId: number) {
    await send(`/api/admin/groups/${groupId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: Number(userId) }),
    });
  }
  async function removeMember(groupId: number, userId: number) {
    await send(`/api/admin/groups/${groupId}/members?userId=${userId}`, { method: "DELETE" });
  }

  const inp: React.CSSProperties = { width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const smallBtn: React.CSSProperties = { height: 28, padding: "0 10px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" };

  // 구성원 추가 후보: 해당 그룹에 없는 사용자
  const candidates = memberGroup
    ? users.filter((u) => u.group_id !== memberGroup.id).filter((u) => {
        const q = memberQ.trim();
        return !q || u.name.includes(q) || u.login_id.includes(q);
      })
    : [];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button onClick={() => { setCreateOpen(true); setCName(""); }} data-testid="add-group-open" style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ 그룹 만들기</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }} data-testid="admin-groups">
        {groups.map((g) => (
          <div key={g.id} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 18 }} data-testid="admin-group-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16, fontWeight: 700, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
              <div style={{ display: "flex", gap: 6, flex: "none" }}>
                <button onClick={() => openEdit(g)} data-testid={`group-edit-${g.id}`} style={smallBtn}>수정</button>
                <button onClick={() => deleteGroup(g)} disabled={busy} data-testid={`group-delete-${g.id}`} style={{ ...smallBtn, color: "#B91C1C", borderColor: "#F1C9C9" }}>삭제</button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 9, background: "#F3F0FE", border: "1px solid #E4DCFB", borderRadius: 10, padding: "10px 12px", marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 9999, background: "#7C5CFC", color: "#fff", fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{(g.leader_name ?? "?").slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }} data-testid="group-leader-name">{g.leader_name ?? "미지정"}</div><div style={{ fontSize: 11, color: "#8B7FC4" }}>그룹장 · 승인 권한</div></div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#9AA1AE" }}>구성원 <span className="tnum">{g.members.length}</span>명</span>
              <button onClick={() => { setMemberForId(g.id); setMemberQ(""); }} data-testid={`group-add-member-${g.id}`} style={{ ...smallBtn, height: 26, fontSize: 11.5 }}>＋ 구성원 추가</button>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} data-testid={`group-members-${g.id}`}>
              {g.members.map((m) => (
                <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#3A4150", fontWeight: 600, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "3px 6px 3px 10px" }}>
                  {m.name}
                  {g.leader_id === m.id && <span style={{ fontSize: 10, color: "#7C5CFC" }}>장</span>}
                  <button onClick={() => removeMember(g.id, m.id)} disabled={busy} aria-label={`${m.name} 제거`} data-testid={`group-member-remove-${g.id}-${m.id}`} style={{ width: 18, height: 18, borderRadius: 9999, border: "none", background: "#E6E8EC", color: "#6B7280", fontSize: 11, lineHeight: "18px", cursor: "pointer", padding: 0 }}>✕</button>
                </span>
              ))}
              {g.members.length === 0 && <span style={{ fontSize: 12, color: "#9AA1AE" }}>구성원 없음</span>}
            </div>
          </div>
        ))}
      </div>

      {/* 그룹 만들기 모달 */}
      {createOpen && (
        <div onClick={() => setCreateOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="group-create-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 420, padding: "20px 22px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>그룹 만들기</div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>그룹명</label>
            <input value={cName} onChange={(e) => setCName(e.target.value)} placeholder="예: 마케팅팀" data-testid="group-name" autoFocus style={inp} onKeyDown={(e) => { if (e.key === "Enter") createGroup(); }} />
            <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 8 }}>그룹장과 구성원은 생성 후 지정할 수 있습니다.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setCreateOpen(false)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={createGroup} disabled={busy} data-testid="group-create-submit" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>만들기</button>
            </div>
          </div>
        </div>
      )}

      {/* 그룹 수정 모달 */}
      {editGroup && (
        <div onClick={() => setEditId(null)} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="group-edit-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 420, padding: "20px 22px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>그룹 정보 수정</div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>그룹명</label>
            <input value={eName} onChange={(e) => setEName(e.target.value)} data-testid="group-edit-name" style={inp} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>그룹장</label>
            <select value={eLeader} onChange={(e) => setELeader(e.target.value)} data-testid="group-edit-leader" style={{ ...inp, cursor: "pointer" }}>
              <option value="">미지정</option>
              {editGroup.members.map((m) => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
            </select>
            <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 8 }}>그룹장은 이 그룹의 구성원 중에서만 지정할 수 있습니다.</div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button onClick={() => setEditId(null)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={saveEdit} disabled={busy} data-testid="group-edit-save" style={{ height: 40, padding: "0 20px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>저장</button>
            </div>
          </div>
        </div>
      )}

      {/* 구성원 추가 모달 */}
      {memberGroup && (
        <div onClick={() => setMemberForId(null)} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="group-member-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 440, padding: "20px 22px", display: "flex", flexDirection: "column", maxHeight: "80vh" }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>구성원 추가</div>
            <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 2, marginBottom: 14 }}>{memberGroup.name}</div>
            <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="이름·아이디로 검색" data-testid="group-member-search" style={{ ...inp, marginBottom: 12 }} />
            <div style={{ overflowY: "auto", border: "1px solid #E2E5EB", borderRadius: 10 }}>
              {candidates.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderTop: "1px solid #F2F3F6" }} data-testid={`group-candidate-${u.id}`}>
                  <div style={{ width: 30, height: 30, borderRadius: 9999, flex: "none", background: "#EDEFF5", color: "#5B6678", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{u.name.slice(0, 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1A1F2B" }}>{u.name}</div>
                    <div style={{ fontSize: 11, color: "#9AA1AE" }}>{u.login_id} · {u.group_name ? <span>현재 {u.group_name}</span> : "소속 없음"}</div>
                  </div>
                  <button onClick={() => addMember(memberGroup.id, u.id)} disabled={busy} data-testid={`group-candidate-add-${u.id}`} style={{ height: 30, padding: "0 14px", border: "none", borderRadius: 7, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer", flex: "none" }}>추가</button>
                </div>
              ))}
              {candidates.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "#9AA1AE", fontSize: 13 }}>추가할 수 있는 사용자가 없습니다.</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setMemberForId(null)} style={{ height: 40, padding: "0 18px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
