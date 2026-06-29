"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type ProjectStatus = "진행중" | "보류" | "완료" | "보관";
type P = {
  id: number;
  name: string;
  cust_name: string | null;
  cust_contact: string | null;
  owner_user_id: number | null;
  owner_name: string | null;
  status: ProjectStatus;
  note: string | null;
};

const STATUS_OPTIONS: ProjectStatus[] = ["진행중", "보류", "완료", "보관"];

// 디자인 projStatusMeta(줄 1641~1648)와 1:1 — 상태 배지 4색.
const PROJ_STATUS_META: Record<ProjectStatus, { color: string; bg: string; border: string }> = {
  진행중: { color: "#1F9254", bg: "#E7F6EC", border: "#BBE5C8" },
  보류: { color: "#B7860B", bg: "#FBF4DA", border: "#EFE0A6" },
  완료: { color: "#2563EB", bg: "#E6EEFD", border: "#BBD0F7" },
  보관: { color: "#6B7280", bg: "#F1F2F4", border: "#D9DCE2" },
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  const m = PROJ_STATUS_META[status] ?? PROJ_STATUS_META["보관"];
  return (
    <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, padding: "3px 9px", borderRadius: 6, background: m.bg, border: `1px solid ${m.border}`, color: m.color }}>
      {status}
    </span>
  );
}

export default function ProjectsAdmin({ projects, users }: { projects: P[]; users: Array<{ id: number; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit">("add");
  const [editId, setEditId] = useState<number | null>(null);
  const [pfName, setPfName] = useState("");
  const [pfCustName, setPfCustName] = useState("");
  const [pfCustContact, setPfCustContact] = useState("");
  const [pfOwner, setPfOwner] = useState(""); // owner_user_id(문자열)
  const [pfStatus, setPfStatus] = useState<ProjectStatus>("진행중");
  const [pfNote, setPfNote] = useState("");
  const [busy, setBusy] = useState(false);

  // 담당자 옵션: 활성 사용자 + (편집 중 프로젝트의 현재 담당자가 비활성이어도 보존)
  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const u of users) map.set(u.id, u.name);
    for (const p of projects) if (p.owner_user_id != null && !map.has(p.owner_user_id)) map.set(p.owner_user_id, p.owner_name ?? `사용자 #${p.owner_user_id}`);
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [users, projects]);

  function openAdd() {
    setMode("add");
    setEditId(null);
    setPfName("");
    setPfCustName("");
    setPfCustContact("");
    setPfOwner(ownerOptions[0] ? String(ownerOptions[0].id) : "");
    setPfStatus("진행중");
    setPfNote("");
    setOpen(true);
  }
  function openEdit(p: P) {
    setMode("edit");
    setEditId(p.id);
    setPfName(p.name ?? "");
    setPfCustName(p.cust_name ?? "");
    setPfCustContact(p.cust_contact ?? "");
    setPfOwner(p.owner_user_id != null ? String(p.owner_user_id) : "");
    setPfStatus(p.status ?? "진행중");
    setPfNote(p.note ?? "");
    setOpen(true);
  }

  // 필수 3종(프로젝트·고객명·담당자) 충족 전 저장 비활성.
  const valid = !!(pfName.trim() && pfCustName.trim() && pfOwner.trim());
  const saveBg = valid ? "#3B5BDB" : "#E2E5EB";
  const saveFg = valid ? "#fff" : "#9AA1AE";

  async function save() {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const payload = {
        name: pfName.trim(),
        custName: pfCustName.trim(),
        custContact: pfCustContact.trim() || null,
        ownerUserId: Number(pfOwner),
        status: pfStatus,
        note: pfNote.trim() || null,
      };
      const url = mode === "edit" && editId != null ? `/api/admin/projects/${editId}` : "/api/admin/projects";
      const method = mode === "edit" ? "PATCH" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "저장에 실패했습니다.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (mode !== "edit" || editId == null || busy) return;
    if (!confirm("이 프로젝트를 삭제할까요? 작성된 보고서의 프로젝트명(자유 텍스트)에는 영향을 주지 않습니다.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/projects/${editId}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "삭제에 실패했습니다.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inp: React.CSSProperties = { width: "100%", height: 42, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" };
  const lab: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: "#3A4150" }}>총 <span className="tnum">{projects.length}</span>개 프로젝트</span>
        <button onClick={openAdd} data-testid="add-project-open" style={{ height: 38, padding: "0 16px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ 프로젝트 추가</button>
      </div>

      {/* 테이블 (PC) */}
      <div className="pc-only" style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, overflow: "hidden" }} data-testid="admin-projects-table">
        <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1.3fr 1.1fr 0.8fr auto", background: "#F7F8FA", borderBottom: "1px solid #E2E5EB" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>프로젝트명</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>고객</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>담당자</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px" }}>상태</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#6B7280", padding: "11px 16px", textAlign: "right" }}>작업</div>
        </div>
        {projects.map((p) => (
          <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 1.3fr 1.1fr 0.8fr auto", alignItems: "center", borderTop: "1px solid #E2E5EB" }} data-testid="admin-project-row">
            <div style={{ padding: "13px 16px" }}><span style={{ fontSize: 14, fontWeight: 700 }}>{p.name}</span></div>
            <div style={{ padding: "13px 16px", fontSize: 13, color: "#3A4150" }}>{p.cust_name || "—"}</div>
            <div style={{ padding: "13px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9999, background: "#EFF1F5", color: "#3A4150", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{(p.owner_name ?? "·").slice(0, 1)}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.owner_name ?? "—"}</span>
              </div>
            </div>
            <div style={{ padding: "13px 16px" }}><StatusBadge status={p.status} /></div>
            <div style={{ padding: "13px 16px", textAlign: "right" }}><button onClick={() => openEdit(p)} data-testid={`admin-project-edit-${p.id}`} style={{ border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer" }}>수정</button></div>
          </div>
        ))}
        {projects.length === 0 && <div style={{ padding: 24, textAlign: "center", color: "#9AA1AE", fontSize: 13, borderTop: "1px solid #E2E5EB" }}>등록된 프로젝트가 없습니다. ‘＋ 프로젝트 추가’로 시작하세요.</div>}
      </div>

      {/* 카드 (모바일) */}
      <div className="sm-only" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {projects.map((p) => (
          <div key={p.id} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 10, padding: 14 }} data-testid="admin-project-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
              <StatusBadge status={p.status} />
            </div>
            <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 10 }}>고객 · {p.cust_name || "—"}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9999, background: "#EFF1F5", color: "#3A4150", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{(p.owner_name ?? "·").slice(0, 1)}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.owner_name ?? "—"}</span>
              </div>
              <button onClick={() => openEdit(p)} style={{ border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 7, fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 12px", cursor: "pointer" }}>수정</button>
            </div>
          </div>
        ))}
        {projects.length === 0 && <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 10, padding: 24, textAlign: "center", color: "#9AA1AE", fontSize: 13 }}>등록된 프로젝트가 없습니다.</div>}
      </div>

      {/* 프로젝트 추가/수정 모달 */}
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 232, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="project-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 480, maxHeight: "90vh", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #EFF1F5", flex: "none" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{mode === "edit" ? "프로젝트 수정" : "프로젝트 추가"}</span>
              <button onClick={() => setOpen(false)} aria-label="닫기" style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA1AE", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: "18px 22px", overflowY: "auto" }}>
              <label style={lab}>프로젝트 <span style={{ color: "#DC2626" }}>*</span></label>
              <input value={pfName} onChange={(e) => setPfName(e.target.value)} data-testid="pf-name" placeholder="프로젝트명을 입력해 주세요" style={inp} />

              <div style={{ fontSize: 12, fontWeight: 700, color: "#6B7280", margin: "18px 0 12px", paddingBottom: 7, borderBottom: "1px solid #EFF1F5" }}>고객정보</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lab}>고객명 <span style={{ color: "#DC2626" }}>*</span></label>
                  <input value={pfCustName} onChange={(e) => setPfCustName(e.target.value)} data-testid="pf-cust-name" placeholder="고객사·부서명" style={inp} />
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lab}>고객담당자</label>
                  <input value={pfCustContact} onChange={(e) => setPfCustContact(e.target.value)} data-testid="pf-cust-contact" placeholder="이름·직함" style={inp} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lab}>담당자 <span style={{ color: "#DC2626" }}>*</span></label>
                  <select value={pfOwner} onChange={(e) => setPfOwner(e.target.value)} data-testid="pf-owner" style={{ ...inp, padding: "0 10px", color: "#3A4150", background: "#fff", cursor: "pointer" }}>
                    <option value="">담당자 선택</option>
                    {ownerOptions.map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <label style={lab}>상태</label>
                  <select value={pfStatus} onChange={(e) => setPfStatus(e.target.value as ProjectStatus)} data-testid="pf-status" style={{ ...inp, padding: "0 10px", color: "#3A4150", background: "#fff", cursor: "pointer" }}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <label style={{ ...lab, margin: "16px 0 6px" }}>비고</label>
              <textarea value={pfNote} onChange={(e) => setPfNote(e.target.value)} data-testid="pf-note" placeholder="특이사항·메모 (선택)" style={{ width: "100%", minHeight: 76, resize: "vertical", border: "1px solid #CBD0D9", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, outline: "none", lineHeight: "20px", boxSizing: "border-box" }} />
            </div>

            <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "14px 22px", borderTop: "1px solid #EFF1F5", flex: "none" }}>
              {mode === "edit" && <button onClick={remove} disabled={busy} data-testid="project-delete" style={{ height: 40, padding: "0 14px", border: "1px solid #F5C2C2", borderRadius: 8, background: "#fff", color: "#DC2626", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>삭제</button>}
              <div style={{ flex: 1 }} />
              <button onClick={() => setOpen(false)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={save} disabled={!valid || busy} data-testid="project-save" style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 8, background: saveBg, color: saveFg, fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: valid ? "pointer" : "not-allowed" }}>저장</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
