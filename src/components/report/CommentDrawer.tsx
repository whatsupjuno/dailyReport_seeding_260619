"use client";

import { useEffect, useState } from "react";
import { statusMeta } from "@/lib/domain/status";
import { applyMention, scanMention, splitMentions } from "@/lib/domain/mentions";

export interface DrawerTask {
  id: number;
  title: string;
  project: string | null;
  status: string;
  zone: string; // 오전/오후/야간/오늘 할 일
}

interface Comment {
  id: number;
  parentId: number | null;
  author: string;
  role: string;
  body: string;
  at: string;
  me: boolean;
  edited: boolean;
  deleted: boolean;
  deletedAt: string | null;
}

interface Member {
  id: number;
  name: string;
  role: string;
}

// @멘션 활성 컨텍스트(브리프 §주요 상태): main=메인 composer, reply=답글, edit=수정
type MentionCtx = { ctx: "main" | "reply" | "edit"; cid?: number };

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

// 삭제 묘비용 시각 'YY.MM.DD HH:MM:SS'(KST·2자리 zero-pad·연도 %100) — 디자인 nowStamp 대응.
function deletedStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}.${g("month")}.${g("day")} ${g("hour")}:${g("minute")}:${g("second")}`;
}

// 멘션 본문 렌더(토큰 강조: #2F49B0/#EEF2FF/radius4, 일반 #3A4150). 분리는 @/lib/domain/mentions.
function MentionedBody({ body, size }: { body: string; size: { font: number; line: number } }) {
  return (
    <div style={{ fontSize: size.font, lineHeight: `${size.line}px`, color: "#3A4150", marginTop: 4, whiteSpace: "pre-wrap" }}>
      {splitMentions(body).map((p, i) => (
        <span
          key={i}
          style={{
            color: p.mention ? "#2F49B0" : "#3A4150",
            fontWeight: p.mention ? 600 : 400,
            background: p.mention ? "#EEF2FF" : "transparent",
            borderRadius: 4,
            padding: "0 1px",
          }}
        >
          {p.text}
        </span>
      ))}
    </div>
  );
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
  const [members, setMembers] = useState<Member[]>([]);
  const [canWrite, setCanWrite] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<number | null>(null); // 답글 작성 중인 부모 댓글 id
  const [replyDraft, setReplyDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null); // 수정 중인 댓글/답글 id
  const [editDraft, setEditDraft] = useState("");
  const [delConfirmId, setDelConfirmId] = useState<number | null>(null); // 삭제 2단계 확인 중인 id
  const [mentionFor, setMentionFor] = useState<MentionCtx | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");

  // 작성/답글/수정/삭제 권한 = 서버 canWrite(작성자·검수권자=true, 순수 관리자=false)와 일치시킨다.
  // role 라벨(=="관리자")로 막으면 검수권자인 관리자(그룹장 겸 admin 등)는 composer(=canWrite 기준)는
  // 보이는데 post가 조용히 막혀 "등록 무반응"이 된다(2026-06-30 버그). canWrite 단일 기준으로 통일.
  const canMutate = canWrite;

  async function refetch() {
    const list = await fetch(`/api/tasks/${task.id}/comments`).then((r) => r.json());
    if (list.ok) setComments(list.comments ?? []);
  }

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

  // @멘션 멤버(실제 조직 사용자) 1회 로드
  useEffect(() => {
    let alive = true;
    fetch(`/api/comments/members`)
      .then((r) => r.json())
      .then((d) => {
        if (alive && d.ok) setMembers(d.members ?? []);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // ESC로 닫기(브리프 §9)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // @쿼리 스캔(브리프 정규식 — @/lib/domain/mentions). 매칭 시 팝업 컨텍스트/쿼리 세팅, 아니면 해제.
  function scan(value: string, ctx: MentionCtx) {
    const q = scanMention(value);
    if (q != null) {
      setMentionFor(ctx);
      setMentionQuery(q);
    } else {
      setMentionFor(null);
      setMentionQuery("");
    }
  }

  const mentionMatches = members.filter((mu) => mu.name.toLowerCase().includes(mentionQuery.toLowerCase()));

  function pickMention(name: string) {
    const ctx = mentionFor;
    if (!ctx) return;
    if (ctx.ctx === "main") setDraft((v) => applyMention(v, name));
    else if (ctx.ctx === "reply") setReplyDraft((v) => applyMention(v, name));
    else if (ctx.ctx === "edit") setEditDraft((v) => applyMention(v, name));
    setMentionFor(null);
    setMentionQuery("");
  }

  async function post() {
    const body = draft.trim();
    if (!body || busy || !canMutate) return;
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
      await refetch();
      setDraft("");
      setMentionFor(null);
      setMentionQuery("");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function postReply(parentId: number) {
    const body = replyDraft.trim();
    if (!body || busy || !canMutate) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "등록에 실패했습니다.");
        return;
      }
      await refetch();
      setReplyTo(null);
      setReplyDraft("");
      setMentionFor(null);
      setMentionQuery("");
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: Comment) {
    setEditingId(c.id);
    setEditDraft(c.body);
    setDelConfirmId(null);
    setReplyTo(null);
    setMentionFor(null);
    setMentionQuery("");
  }
  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
    setMentionFor(null);
    setMentionQuery("");
  }
  async function saveEdit() {
    const body = editDraft.trim();
    if (!body || busy || editingId == null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "수정에 실패했습니다.");
        return;
      }
      await refetch();
      cancelEdit();
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete(id: number) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.ok) {
        alert(d.error ?? "삭제에 실패했습니다.");
        return;
      }
      await refetch();
      setDelConfirmId(null);
      onChanged?.();
    } finally {
      setBusy(false);
    }
  }

  const m = statusMeta(task.status);
  const placeholder = role === "그룹장" || role === "관리자" ? "작성자에게 전달할 피드백을 남겨주세요." : "이 업무에 대한 댓글을 남겨주세요.";

  // 멘션 자동완성 팝업(컨텍스트/사이즈별). open이면 필터 결과를 아이템으로.
  function MentionPopup({ open, variant }: { open: boolean; variant: "main" | "reply" | "editComment" | "editReply" }) {
    if (!open || mentionMatches.length === 0) return null;
    const sz =
      variant === "main"
        ? { av: 24, name: 14, role: 12, gap: 9, pad: "8px 12px", mt: 6 }
        : variant === "editReply"
          ? { av: 20, name: 12, role: 10, gap: 8, pad: "6px 9px", mt: 4 }
          : { av: 22, name: 13, role: 11, gap: 8, pad: "7px 10px", mt: 4 };
    return (
      <div data-testid="mention-popup" style={{ marginTop: sz.mt, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", boxShadow: "0 4px 12px rgba(16,24,40,.1)", overflow: "hidden" }}>
        {mentionMatches.map((mu) => {
          const senior = mu.role === "그룹장" || mu.role === "관리자";
          const avBg = senior ? "#E0E7FF" : "#EFF1F5";
          const avFg = senior ? "#2F49B0" : "#3A4150";
          return (
            <button key={mu.id} type="button" data-testid="mention-option" onMouseDown={(e) => { e.preventDefault(); pickMention(mu.name); }} style={{ display: "flex", alignItems: "center", gap: sz.gap, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #F2F3F6", padding: sz.pad, cursor: "pointer", fontFamily: "inherit" }}>
              <span style={{ width: sz.av, height: sz.av, borderRadius: 9999, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: avBg, color: avFg, fontSize: Math.round(sz.av / 2), fontWeight: 700 }}>{mu.name.slice(0, 1)}</span>
              <span style={{ fontSize: sz.name, fontWeight: 600, color: "#1A1F2B" }}>{mu.name}</span>
              <span style={{ fontSize: sz.role, color: "#9AA1AE" }}>{mu.role}</span>
            </button>
          );
        })}
      </div>
    );
  }

  // 단일 댓글/대댓글 렌더(수정 인라인·삭제 2단계·묘비·멘션 포함). reply=답글 톤(작은 치수).
  function CommentItem({ c, reply = false }: { c: Comment; reply?: boolean }) {
    const rs = ROLE_STYLE[c.role] ?? ROLE_STYLE["직원"];
    const av = reply ? 22 : 28;
    const showActions = c.me && canMutate && !c.deleted;
    const isEditing = editingId === c.id;
    return (
      <div data-testid="comment-item" style={{ display: "flex", gap: reply ? 8 : 10, padding: reply ? "8px 0" : "10px 0 12px", borderBottom: reply ? "none" : "1px solid #F2F3F6", boxShadow: c.me ? "none" : "inset 3px 0 0 #EEF2FF", paddingLeft: 8 }}>
        <div style={{ width: av, height: av, borderRadius: 9999, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: c.me ? "#3B5BDB" : "#EEF2FF", color: c.me ? "#fff" : "#2F49B0", fontSize: reply ? 10 : 12, fontWeight: 700 }}>{c.author.slice(0, 1)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: reply ? 12 : 13, fontWeight: 600 }}>{c.author}{c.me ? " (나)" : ""}</span>
            <span style={{ fontSize: reply ? 10 : 11, fontWeight: 600, color: rs.fg, background: rs.bg, borderRadius: 9999, padding: reply ? "1px 6px" : "1px 7px" }}>{c.role}</span>
            <span style={{ fontSize: reply ? 10 : 11, color: "#9AA1AE" }} className="tnum">{hhmm(c.at)}</span>
            {c.edited && !c.deleted && (
              <span data-testid="comment-edited" style={{ fontSize: reply ? 9 : 10, fontWeight: 600, color: "#B7860B", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 9999, padding: reply ? "0 6px" : "0 7px" }}>수정됨</span>
            )}
          </div>

          {c.deleted ? (
            <div data-testid="comment-tombstone" style={{ display: "flex", alignItems: "center", gap: reply ? 5 : 6, fontSize: reply ? 12 : 13, color: "#9AA1AE", fontStyle: "italic", marginTop: reply ? 3 : 4 }}>
              <svg width={reply ? 13 : 14} height={reply ? 13 : 14} viewBox="0 0 20 20" fill="none" style={{ flex: "none" }}><path d="M5 6h10M8 6V5h4v1M6 6l1 9h6l1-9" stroke="#9AA1AE" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              {deletedStamp(c.deletedAt)}에 삭제된 댓글입니다.
            </div>
          ) : isEditing ? (
            <div style={{ marginTop: reply ? 5 : 6 }}>
              <textarea
                value={editDraft}
                onChange={(e) => { const v = e.target.value.slice(0, 10000); setEditDraft(v); scan(v, { ctx: "edit", cid: c.id }); }}
                autoFocus
                data-testid="comment-edit-input"
                placeholder={reply ? "답글을 수정하세요" : "댓글을 수정하세요"}
                style={{ width: "100%", minHeight: reply ? 40 : 44, border: "1px solid #CBD0D9", borderRadius: 8, padding: reply ? "7px 9px" : "8px 10px", fontFamily: "inherit", fontSize: reply ? 12 : 13, resize: "vertical", outline: "none", boxSizing: "border-box" }}
              />
              <MentionPopup open={mentionFor?.ctx === "edit" && editingId === c.id} variant={reply ? "editReply" : "editComment"} />
              <div style={{ display: "flex", alignItems: "center", gap: reply ? 6 : 8, marginTop: reply ? 5 : 6 }}>
                <div style={{ flex: 1 }} />
                <button onClick={cancelEdit} style={{ height: reply ? 28 : 30, padding: reply ? "0 10px" : "0 12px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={saveEdit} disabled={!editDraft.trim() || busy} data-testid="comment-edit-save" style={{ height: reply ? 28 : 30, padding: reply ? "0 12px" : "0 14px", border: "none", borderRadius: 7, background: editDraft.trim() ? "#3B5BDB" : "#E2E5EB", color: editDraft.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 600, cursor: editDraft.trim() ? "pointer" : "default" }}>저장</button>
              </div>
            </div>
          ) : (
            <>
              <MentionedBody body={c.body} size={reply ? { font: 13, line: 19 } : { font: 14, line: 21 }} />
              {showActions && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: reply ? 5 : 6 }}>
                  {delConfirmId === c.id ? (
                    <>
                      <span style={{ fontSize: reply ? 11 : 12, color: "#6B7280" }}>삭제할까요?</span>
                      <button onClick={() => confirmDelete(c.id)} disabled={busy} data-testid="comment-delete-confirm" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 700, color: "#B91C1C" }}>삭제</button>
                      <button onClick={() => setDelConfirmId(null)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 600, color: "#6B7280" }}>취소</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => startEdit(c)} data-testid="comment-edit" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 600, color: "#6B7280" }}>수정</button>
                      <button onClick={() => { setDelConfirmId(c.id); setEditingId(null); }} data-testid="comment-delete" style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", fontSize: reply ? 11 : 12, fontWeight: 600, color: "#B91C1C" }}>삭제</button>
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

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
            comments
              .filter((c) => c.parentId == null)
              .map((parent) => {
                const children = comments.filter((c) => c.parentId === parent.id);
                return (
                  <div key={parent.id} data-testid="comment-thread">
                    <CommentItem c={parent} />
                    {children.length > 0 && (
                      <div style={{ marginLeft: 38, borderLeft: "2px solid #EDEFF3", paddingLeft: 6 }}>
                        {children.map((ch) => (
                          <CommentItem key={ch.id} c={ch} reply />
                        ))}
                      </div>
                    )}
                    {canWrite &&
                      (replyTo === parent.id ? (
                        <div style={{ marginLeft: 38, marginTop: 2, marginBottom: 10 }}>
                          <textarea value={replyDraft} onChange={(e) => { const v = e.target.value.slice(0, 10000); setReplyDraft(v); scan(v, { ctx: "reply", cid: parent.id }); }} autoFocus data-testid="reply-input" placeholder="답글을 남겨주세요." style={{ width: "100%", minHeight: 44, border: "1px solid #CBD0D9", borderRadius: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
                          <MentionPopup open={mentionFor?.ctx === "reply" && mentionFor?.cid === parent.id} variant="reply" />
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                            <div style={{ flex: 1 }} />
                            <button onClick={() => { setReplyTo(null); setReplyDraft(""); setMentionFor(null); }} style={{ height: 32, padding: "0 12px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>취소</button>
                            <button onClick={() => postReply(parent.id)} disabled={!replyDraft.trim() || busy} data-testid="reply-post" style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 7, background: replyDraft.trim() ? "#3B5BDB" : "#E2E5EB", color: replyDraft.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: replyDraft.trim() ? "pointer" : "default" }}>답글 등록</button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => { setReplyTo(parent.id); setReplyDraft(""); setEditingId(null); setMentionFor(null); }} data-testid="reply-open" style={{ marginLeft: 38, marginBottom: 10, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3B5BDB", padding: "2px 0" }}>↳ 답글</button>
                      ))}
                  </div>
                );
              })
          )}
        </div>

        <div style={{ flex: "none", padding: "12px 18px", borderTop: "1px solid #EFF1F5" }}>
          {canWrite ? (
            <>
              <textarea value={draft} onChange={(e) => { const v = e.target.value.slice(0, 10000); setDraft(v); scan(v, { ctx: "main" }); }} data-testid="comment-input" placeholder={placeholder} style={{ width: "100%", minHeight: 56, border: "1px solid #CBD0D9", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
              <MentionPopup open={mentionFor?.ctx === "main"} variant="main" />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{draft.length} / 10,000</span>
                <div style={{ flex: 1 }} />
                <button onClick={post} disabled={!draft.trim() || busy} data-testid="comment-post" style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 8, background: draft.trim() ? "#3B5BDB" : "#E2E5EB", color: draft.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: draft.trim() ? "pointer" : "default" }}>등록</button>
              </div>
            </>
          ) : (
            <div data-testid="comment-readonly" style={{ display: "flex", gap: 8, alignItems: "center", background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 8, padding: "10px 12px" }}>
              <span style={{ fontSize: 13, color: "#6B7280" }}>{role === "관리자" ? "관리자는 댓글을 열람만 할 수 있어요." : "이 업무에 댓글을 남길 권한이 없습니다."}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/** 업무 행의 댓글 버튼(수·미읽음 핀·그룹장 미확인 배지 포함) — 작성·검수 공통 */
export function CommentButton({
  count,
  unread,
  leaderUnread = false,
  onClick,
}: {
  count: number;
  unread: boolean;
  leaderUnread?: boolean;
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
      {leaderUnread && (
        <span data-testid="comment-unconfirmed" style={{ fontSize: 10, fontWeight: 700, background: "#3B5BDB", color: "#fff", borderRadius: 9999, padding: "1px 7px" }}>미확인</span>
      )}
    </button>
  );
}
