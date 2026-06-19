"use client";

import { useEffect, useState } from "react";
import { statusMeta } from "@/lib/domain/status";

export interface DrawerTask {
  id: number;
  title: string;
  project: string | null;
  status: string;
  zone: string; // 오전/오후/야간/오늘 할 일
}

interface Comment {
  id: number;
  author: string;
  role: string;
  body: string;
  at: string;
  me: boolean;
}

// 댓글 역할 배지(브리프 §4.1): 그룹장 골드 · 관리자 파랑 · 직원 회색
const ROLE_STYLE: Record<string, { bg: string; fg: string }> = {
  그룹장: { bg: "#FBF4DA", fg: "#B7860B" },
  관리자: { bg: "#EEF2FF", fg: "#2F49B0" },
  직원: { bg: "#F1F2F4", fg: "#6B7280" },
};

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export default function CommentDrawer({
  task,
  role,
  onClose,
  onChanged,
}: {
  task: DrawerTask;
  role: string; // 뷰어 역할 라벨(그룹장/직원/관리자)
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/tasks/${task.id}/comments`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d.ok) {
          setComments(d.comments ?? []);
          setCanWrite(!!d.canWrite);
          // GET이 읽음 워터마크를 갱신 → 부모 미읽음 핀 즉시 해제
          if ((d.comments ?? []).length > 0) onChanged?.();
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  // ESC로 닫기(브리프 §9)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function post() {
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "등록에 실패했습니다.");
        return;
      }
      const list = await fetch(`/api/tasks/${task.id}/comments`).then((r) => r.json());
      if (list.ok) setComments(list.comments ?? []);
      setDraft("");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const m = statusMeta(task.status);
  const placeholder = role === "그룹장" || role === "관리자" ? "작성자에게 전달할 피드백을 남겨주세요." : "이 업무에 대한 댓글을 남겨주세요.";

  return (
    <>
      <div onClick={onClose} className="cmt-backdrop" style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)" }} />
      <div className="cmt-drawer" data-testid="comment-drawer" style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 221, width: "min(400px, 92vw)", background: "#fff", borderLeft: "1px solid #E2E5EB", boxShadow: "-4px 0 16px rgba(16,24,40,.08)", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: "none", padding: "16px 18px", borderBottom: "1px solid #EFF1F5" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                {task.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{task.project}</span>}
                <span style={{ fontSize: 12, fontWeight: 600, color: "#9AA1AE" }}>댓글</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, lineHeight: "21px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.title}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 6 }}>
                <span style={{ fontSize: 12, color: "#6B7280" }}>{task.zone}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{task.status}</span>
              </div>
            </div>
            <button onClick={onClose} data-testid="comment-close" aria-label="댓글 닫기" style={{ flex: "none", background: "none", border: "none", cursor: "pointer", color: "#9AA1AE", fontSize: 20, lineHeight: 1 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px" }}>
          {loading ? (
            <div style={{ textAlign: "center", padding: "48px 0", color: "#9AA1AE", fontSize: 13 }}>불러오는 중…</div>
          ) : comments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "48px 0" }}>
              <div style={{ fontSize: 28, color: "#CBD0D9" }}>💬</div>
              <div style={{ fontSize: 15, color: "#6B7280", marginTop: 10 }}>아직 댓글이 없어요</div>
              <div style={{ fontSize: 13, color: "#9AA1AE", marginTop: 4 }}>이 업무에 대한 첫 댓글을 남겨보세요.</div>
            </div>
          ) : (
            comments.map((c) => {
              const rs = ROLE_STYLE[c.role] ?? ROLE_STYLE["직원"];
              return (
                <div key={c.id} data-testid="comment-item" style={{ display: "flex", gap: 10, padding: "10px 0 12px", borderBottom: "1px solid #F2F3F6", boxShadow: c.me ? "none" : "inset 3px 0 0 #EEF2FF", paddingLeft: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 9999, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: c.me ? "#3B5BDB" : "#EEF2FF", color: c.me ? "#fff" : "#2F49B0", fontSize: 12, fontWeight: 700 }}>{c.author.slice(0, 1)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{c.author}{c.me ? " (나)" : ""}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: rs.fg, background: rs.bg, borderRadius: 9999, padding: "1px 7px" }}>{c.role}</span>
                      <span style={{ fontSize: 11, color: "#9AA1AE" }} className="tnum">{hhmm(c.at)}</span>
                    </div>
                    <div style={{ fontSize: 14, lineHeight: "21px", color: "#3A4150", marginTop: 4, whiteSpace: "pre-wrap" }}>{c.body}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div style={{ flex: "none", padding: "12px 18px", borderTop: "1px solid #EFF1F5" }}>
          {canWrite ? (
            <>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, 10000))} data-testid="comment-input" placeholder={placeholder} style={{ width: "100%", minHeight: 56, border: "1px solid #CBD0D9", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{draft.length} / 10,000</span>
                <div style={{ flex: 1 }} />
                <button onClick={post} disabled={!draft.trim() || busy} data-testid="comment-post" style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 8, background: draft.trim() ? "#3B5BDB" : "#E2E5EB", color: draft.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: draft.trim() ? "pointer" : "default" }}>등록</button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 8, padding: "10px 12px" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>이 업무에 댓글을 남길 권한이 없습니다.</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 업무 행의 댓글 버튼(수·미읽음 핀 포함) — 작성·검수 공통 */
export function CommentButton({
  count,
  unread,
  onClick,
}: {
  count: number;
  unread: boolean;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} title="댓글" data-testid="comment-button" style={{ flex: "none", display: "flex", alignItems: "center", gap: 5, background: "#fff", border: "1px solid #E2E5EB", borderRadius: 7, cursor: "pointer", padding: "5px 9px", marginTop: 1, height: 30 }}>
      <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
        <path d="M4 5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-3 3v-3H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" stroke="#6B7280" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      {count > 0 && (
        <span data-testid={unread ? "comment-unread" : "comment-count"} style={{ fontSize: 11, fontWeight: 700, background: unread ? "#3B5BDB" : "#EEF2FF", color: unread ? "#fff" : "#2F49B0", borderRadius: 9999, padding: "1px 6px" }} className="tnum">{count}</span>
      )}
    </button>
  );
}
