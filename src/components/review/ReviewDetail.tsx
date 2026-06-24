"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { statusMeta } from "@/lib/domain/status";
import CommentDrawer, { CommentButton, type DrawerTask } from "@/components/report/CommentDrawer";
import TaskDescBox from "@/components/report/TaskDescBox";

export interface ReviewAttachment {
  id: number;
  kind: "file" | "url";
  fileName: string | null;
  url: string | null;
  comment: string | null;
}
export interface ReviewTask {
  id: number;
  project: string | null;
  title: string;
  status: string;
  doneTime: string | null;
  isNight: boolean;
  plannedMin: number | null;
  actualMin: number | null;
  hold: string | null;
  description: string | null;
  attachments: ReviewAttachment[];
  commentCount: number;
  commentUnread: boolean;
  rejectComment: string | null;
  rejectedBy: string | null;
  rejectedById: number | null;
}
interface ReviewSection {
  kind: string;
  name: string;
  status: string;
  tasks: ReviewTask[];
}
export interface ReviewView {
  reportId: number;
  reviewerName: string;
  reviewerId: number;
  viewerRole: string;
  ownerName: string;
  dept: string | null;
  dateLabel: string;
  status: string;
  isVacation: boolean;
  vacationType: string | null;
  vacationComment: string | null;
  nightReason: string | null;
  dailyComment: string | null;
  pending: boolean; // 검수대기(전체 승인/반려 가능)
  reviewable: boolean; // 계획제출 ∨ 검수대기(행 반려 가능)
  canAct: boolean; // 액션(승인/반려/행반려) 권한. false면 관리자 열람 전용 → 액션 UI 숨김
  canPlanReject: boolean; // 계획 반려 가능(계획제출 + 그룹장, 셀프 제외)
  openRejectCount: number;
  heldTaskCount: number;
  model: 1 | 2;
  queueNav: { position: string | null; prevId: number | null; nextId: number | null };
  buckets?: { todo: ReviewTask[]; am: ReviewTask[]; pm: ReviewTask[]; night: ReviewTask[] };
  sections?: ReviewSection[];
  comms: Array<{ type: string; counterpart: string; time: string | null; summary: string; attachments: Array<{ id: number; fileName: string | null; url: string | null; comment: string | null }> }>;
  events: Array<{ kind: string; actorName: string | null; comment: string | null; rejectTarget: string | null; at: string }>;
}

const EVENT_LABEL: Record<string, string> = { submitted: "제출", rejected: "반려", plan_rejected: "계획 반려", resubmitted: "재제출", approved: "승인" };
const REJECT_KINDS = ["rejected", "plan_rejected"]; // 반려 계열(전역/계획) — 배너·이력·강조 공통 판정
const REJECT_TEMPLATES = ["일정 누락", "근거 불충분", "완결 처리 오류", "커뮤니케이션 기록 누락", "내용 구체화 필요"];

function timeOf(ts: string): string {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ts));
}

const navBtn: React.CSSProperties = { width: 28, height: 28, border: "1px solid #E2E5EB", background: "#fff", borderRadius: 7, display: "inline-flex", alignItems: "center", justifyContent: "center", textDecoration: "none", fontSize: 12 };
const reviewChipLink: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 7, padding: "4px 9px", fontSize: 12, color: "#3A4150", textDecoration: "none", fontWeight: 600, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

// 행/버킷은 모듈 레벨 컴포넌트로 둔다. ReviewDetail '안'에 정의하면 매 렌더마다 새 함수 식별자가 되어
// React가 하위 트리를 remount → 입력(반려 사유 등) 포커스가 풀려 iOS에서 키보드가 내려감(원인 버그).
// 상태/핸들러는 ctx 한 객체로 전달(매 렌더 새 객체여도 re-render만 되고 remount되지 않음).
interface RowCtx {
  view: ReviewView;
  busy: boolean;
  rowRejectId: number | null;
  rowComment: string;
  setRowComment: (v: string) => void;
  setRowRejectId: (v: number | null) => void;
  openDrawer: (t: ReviewTask, zone: string) => void;
  submitRowReject: (taskId: number) => void;
  undoRowReject: (taskId: number) => void;
}

function ReviewTaskRow({ t, zone, ctx }: { t: ReviewTask; zone: string; ctx: RowCtx }) {
  const { view, busy } = ctx;
  const m = statusMeta(t.status);
  const rejected = !!t.rejectComment;
  // 설명·첨부·반려밴드·반려폼은 전체폭 영역으로 → 박스 우측 끝이 [반려] 버튼 끝과 일치
  const hasDetail = !!(t.description && t.description.trim()) || !!t.hold || t.attachments.length > 0 || rejected || ctx.rowRejectId === t.id;
  return (
    <div data-testid="review-task-row" data-task-id={t.id} style={{ padding: "11px 0", borderBottom: "1px solid #F2F3F6", boxShadow: rejected ? "inset 3px 0 0 #DC2626" : t.status === "지연" ? "inset 3px 0 0 #F6D9A8" : "none", paddingLeft: rejected || t.status === "지연" ? 10 : 0 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
            <span style={{ fontSize: 14, fontWeight: 600 }}>{t.title}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status}</span>
            {t.isNight && <span style={{ fontSize: 11, fontWeight: 600, color: "#8A6508", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 6, padding: "2px 7px" }}>🌙 야간</span>}
            {t.doneTime && <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F1F2F4", borderRadius: 6, padding: "2px 7px" }} className="tnum">✓ 마감 {t.doneTime}</span>}
          </div>
          {(t.plannedMin || t.actualMin) && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 3 }} className="tnum">{t.plannedMin ? `계획 ${t.plannedMin}분` : ""}{t.actualMin ? ` / 실제 ${t.actualMin}분` : ""}</div>}
        </div>
        <CommentButton count={t.commentCount} unread={t.commentUnread} onClick={() => ctx.openDrawer(t, zone)} />
        {view.canAct && view.reviewable && !rejected && ctx.rowRejectId !== t.id && (
          <button onClick={() => { ctx.setRowRejectId(t.id); ctx.setRowComment(""); }} data-testid={`row-reject-${t.id}`} style={{ flex: "none", background: "#fff", border: "1px solid #F5C2C2", color: "#DC2626", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "5px 11px", marginTop: 1 }}>반려</button>
        )}
      </div>
      {hasDetail && (
        <div>
          <TaskDescBox desc={t.description} />
          {t.hold && <div style={{ fontSize: 12, color: "#B45309", marginTop: 5 }}>지연 사유 · {t.hold}</div>}
          {t.attachments.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {t.attachments.map((a) =>
                a.kind === "file" ? (
                  <a key={a.id} href={`/api/attachments/${a.id}`} style={reviewChipLink} title={a.comment ?? undefined}>📎 {a.fileName}{a.comment ? ` · ${a.comment}` : ""}</a>
                ) : (
                  <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noreferrer" style={reviewChipLink} title={a.comment ?? a.url ?? undefined}>🔗 {a.comment || a.url}</a>
                ),
              )}
            </div>
          )}
          {rejected && (
            <div data-testid="row-reject-band" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#B91C1C", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 7, padding: "7px 10px", marginTop: 8 }}>
              <span style={{ fontWeight: 700 }}>↩ 반려</span>
              <span style={{ flex: 1 }}>{t.rejectComment}{t.rejectedBy ? ` · ${t.rejectedBy}` : ""}</span>
              {view.canAct && view.reviewable && t.rejectedById === view.reviewerId && (
                <button onClick={() => ctx.undoRowReject(t.id)} disabled={busy} data-testid={`row-reject-undo-${t.id}`} style={{ flex: "none", background: "none", border: "none", color: "#B91C1C", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>취소</button>
              )}
            </div>
          )}
          {ctx.rowRejectId === t.id && (
            <div style={{ marginTop: 8, border: "1px solid #F5C2C2", borderRadius: 8, background: "#FFF7F7", padding: 12 }}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {REJECT_TEMPLATES.map((tpl) => (
                  <button key={tpl} onClick={() => ctx.setRowComment(tpl)} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "4px 10px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3A4150" }}>{tpl}</button>
                ))}
              </div>
              <textarea value={ctx.rowComment} onChange={(e) => ctx.setRowComment(e.target.value)} data-testid="row-reject-comment" placeholder="이 업무를 반려하는 사유를 적어주세요." style={{ width: "100%", minHeight: 64, border: "1px solid #CBD0D9", borderRadius: 8, padding: 10, fontFamily: "inherit", fontSize: 13, resize: "vertical", outline: "none" }} />
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                <button onClick={() => { ctx.setRowRejectId(null); ctx.setRowComment(""); }} style={{ height: 34, padding: "0 14px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={() => ctx.submitRowReject(t.id)} disabled={busy} data-testid={`row-reject-confirm-${t.id}`} style={{ height: 34, padding: "0 14px", border: "none", borderRadius: 8, background: ctx.rowComment.trim() ? "#DC2626" : "#E2E5EB", color: ctx.rowComment.trim() ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>이 업무 반려</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewBucket({ testid, name, range, tasks, zone, ctx }: { testid: string; name: string; range: string; tasks: ReviewTask[]; zone: string; ctx: RowCtx }) {
  if (tasks.length === 0) return null;
  return (
    <div data-testid={testid} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{range}</span>
        <div style={{ flex: 1 }} />
        {zone === "오늘 할 일"
          ? <span className="badge" style={{ color: "#3A4150", background: "#F1F2F4", border: "1px solid #D9DCE2" }}>{tasks.length}건</span>
          : <span className="badge" style={{ color: "#1F7A46", background: "#E7F5EC", border: "1px solid #BCE5CC" }}>✓ 마감완료</span>}
      </div>
      <div style={{ padding: "6px 18px 14px" }}>
        {tasks.map((t) => <ReviewTaskRow key={t.id} t={t} zone={zone} ctx={ctx} />)}
      </div>
    </div>
  );
}

export default function ReviewDetail({ view }: { view: ReviewView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [target, setTarget] = useState("전체");
  const [planRejectOpen, setPlanRejectOpen] = useState(false);
  const [planComment, setPlanComment] = useState("");
  const [drawer, setDrawer] = useState<DrawerTask | null>(null);
  const [rowRejectId, setRowRejectId] = useState<number | null>(null);
  const [rowComment, setRowComment] = useState("");

  const openDrawer = (t: ReviewTask, zone: string) =>
    setDrawer({ id: t.id, title: t.title, project: t.project, status: t.status, zone });

  async function call(url: string, init: RequestInit): Promise<boolean> {
    setBusy(true);
    try {
      const res = await fetch(url, init);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "처리에 실패했습니다.");
        // 다른 검수자가 이미 처리했거나 상태 변경됨(409) → 최신 상태로 동기화
        if (res.status === 409) router.refresh();
        else if (res.status === 401) router.push("/login");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    // 미해소 행 반려가 있는데 승인하면 반려가 모두 해소됨 → 확인
    if (view.openRejectCount > 0 && !window.confirm(`반려한 업무 ${view.openRejectCount}건이 있습니다. 승인하면 반려가 모두 해제됩니다. 그래도 승인할까요?`))
      return;
    if (await call(`/api/reviews/${view.reportId}/approve`, { method: "POST" })) {
      router.push("/review");
      router.refresh();
    }
  }

  async function reject() {
    if (!comment.trim() && view.openRejectCount === 0) {
      alert("반려 사유를 입력하거나 업무 행을 반려해 주세요.");
      return;
    }
    const ok = await call(`/api/reviews/${view.reportId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment, target }),
    });
    if (ok) {
      setRejectOpen(false);
      router.push("/review");
      router.refresh();
    }
  }

  async function planReject() {
    if (planComment.trim().length < 10) {
      alert("계획 반려 사유를 10자 이상 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/reviews/${view.reportId}/plan-reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: planComment.trim() }),
    });
    if (ok) {
      setPlanRejectOpen(false);
      router.push("/review");
      router.refresh();
    }
  }

  async function submitRowReject(taskId: number) {
    if (!rowComment.trim()) {
      alert("반려 사유를 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/tasks/${taskId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: rowComment }),
    });
    if (ok) {
      setRowRejectId(null);
      setRowComment("");
      router.refresh();
    }
  }

  async function undoRowReject(taskId: number) {
    if (await call(`/api/tasks/${taskId}/reject`, { method: "DELETE" })) router.refresh();
  }

  // 행/버킷 컴포넌트로 넘길 상태·핸들러 묶음(매 렌더 새 객체여도 re-render만, remount 아님)
  const ctx: RowCtx = { view, busy, rowRejectId, rowComment, setRowComment, setRowRejectId, openDrawer, submitRowReject, undoRowReject };

  // 집계 요약 + 제출 메타(디자인 헤더/액션바)
  const rtasks = view.buckets ? [...view.buckets.todo, ...view.buckets.am, ...view.buckets.pm, ...view.buckets.night] : (view.sections ?? []).flatMap((s) => s.tasks);
  const cDone = rtasks.filter((t) => t.status === "완결").length;
  const cDelay = rtasks.filter((t) => t.status === "지연").length;
  const cTotal = rtasks.length;
  const cIncomplete = cTotal - cDone - cDelay;
  const countSummary = `완결 ${cDone} · 지연 ${cDelay} · 미완 ${cIncomplete} · 전체 ${cTotal}`;
  const actionSummary = `완결 ${cDone} · 지연 ${cDelay} · 미완 ${cIncomplete}`;
  const evTime = (kind: string) => { const e = view.events.find((x) => x.kind === kind); return e ? timeOf(e.at) : null; };
  const rejectEv = view.events.find((x) => REJECT_KINDS.includes(x.kind));
  const rejectTime = rejectEv ? timeOf(rejectEv.at) : null;
  const submitMeta = [evTime("submitted") && `최초제출 ${evTime("submitted")}`, rejectTime && `반려 ${rejectTime}`, evTime("resubmitted") && `재제출 ${evTime("resubmitted")}`].filter(Boolean).join(" · ");

  return (
    <div>
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E5EB", height: 56, display: "flex", alignItems: "center", padding: "0 24px", gap: 14 }}>
        <a href="/review" style={{ fontSize: 13, fontWeight: 600, color: "#3B5BDB", textDecoration: "none" }}>← 목록으로</a>
        {view.queueNav.position && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 14, borderLeft: "1px solid #E2E5EB" }} data-testid="queue-nav">
            <span style={{ fontSize: 13, color: "#6B7280" }} className="tnum">{view.queueNav.position}</span>
            {view.queueNav.prevId ? (
              <a href={`/review/${view.queueNav.prevId}`} data-testid="queue-prev" style={{ ...navBtn, color: "#3A4150" }}>◀</a>
            ) : (
              <span style={{ ...navBtn, color: "#CBD0D9" }}>◀</span>
            )}
            {view.queueNav.nextId ? (
              <a href={`/review/${view.queueNav.nextId}`} data-testid="queue-next" style={{ ...navBtn, color: "#3A4150" }}>▶</a>
            ) : (
              <span style={{ ...navBtn, color: "#CBD0D9" }}>▶</span>
            )}
          </div>
        )}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "#6B7280" }}>검수자 <strong style={{ color: "#3A4150" }}>{view.reviewerName}</strong></span>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 100px", display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }} className="review-grid">
        <div>
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 22px", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
              <div style={{ width: 40, height: 40, borderRadius: 9999, background: "#E0E7FF", color: "#2F49B0", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{view.ownerName.slice(0, 1)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{view.ownerName} <span style={{ fontSize: 13, color: "#6B7280", fontWeight: 400 }}>{view.dept}</span></div>
                <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }} className="tnum">{view.dateLabel}</div>
                {submitMeta && <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 4 }} className="tnum">{submitMeta}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <span data-testid="review-status" className="badge" style={{ background: statusMeta(view.status).bg, border: `1px solid ${statusMeta(view.status).line}`, color: statusMeta(view.status).main }}>{view.status}</span>
                  {!view.isVacation && cDelay > 0 && <span className="badge" style={{ background: "#FCEBEB", border: "1px solid #F5C2C2", color: "#B91C1C" }}>❗지연</span>}
                </div>
                {!view.isVacation && cTotal > 0 && <div style={{ fontSize: 12, color: "#6B7280" }} data-testid="review-count-summary">{countSummary}</div>}
              </div>
            </div>
          </div>

          {view.isVacation ? (
            <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "28px 24px" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{view.vacationType === "휴직" ? "휴직입니다" : `휴가일입니다 (${view.vacationType ?? "휴가"})`}</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>휴가/휴직 보고서도 확인이 필요합니다. 승인 또는 반려해 주세요.</div>
              {view.vacationComment && (
                <div style={{ background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 10, padding: "12px 14px", marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#8A6508" }}>부재 사유</div>
                  <div style={{ fontSize: 13, color: "#6B5316", lineHeight: "20px", marginTop: 8, whiteSpace: "pre-wrap" }}>{view.vacationComment}</div>
                </div>
              )}
              {view.heldTaskCount > 0 && (
                <div data-testid="held-tasks" style={{ fontSize: 12, color: "#9AA1AE", marginTop: 12 }}>
                  ※ 이 날 작성된 업무 {view.heldTaskCount}건이 보류되어 있습니다(휴가 처리로 검수 대상에서 제외).
                </div>
              )}
            </div>
          ) : (
            <>
              {view.dailyComment && (
                <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>일일 코멘트</div>
                  <div style={{ borderLeft: "3px solid #E2E5EB", paddingLeft: 12, fontSize: 14, color: "#3A4150", whiteSpace: "pre-wrap" }}>{view.dailyComment}</div>
                </div>
              )}
              {view.model === 2 && view.buckets ? (
                <>
                  <ReviewBucket testid="review-bucket-todo" name="미완료 · 진행 중" range="" tasks={view.buckets.todo} zone="오늘 할 일" ctx={ctx} />
                  <ReviewBucket testid="review-bucket-am" name="오전 계획·마감" range="08:30 ~ 11:50" tasks={view.buckets.am} zone="오전" ctx={ctx} />
                  <ReviewBucket testid="review-bucket-pm" name="오후 마감" range="11:50 ~ 17:50" tasks={view.buckets.pm} zone="오후" ctx={ctx} />
                  <ReviewBucket testid="review-bucket-night" name="🌙 야간" range="20:00 ~" tasks={view.buckets.night} zone="야간" ctx={ctx} />
                </>
              ) : (
                (view.sections ?? []).filter((s) => s.tasks.length > 0).map((sec) => (
                  <div key={sec.kind} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }} data-testid={`review-section-${sec.kind}`}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC" }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>{sec.name}</span>
                      <div style={{ flex: 1 }} />
                      <span className="badge" style={{ background: statusMeta(sec.status).bg, border: `1px solid ${statusMeta(sec.status).line}`, color: statusMeta(sec.status).main }}>{sec.status}</span>
                    </div>
                    <div style={{ padding: "6px 18px 14px" }}>
                      {sec.tasks.map((t) => <ReviewTaskRow key={t.id} t={t} zone={sec.name} ctx={ctx} />)}
                    </div>
                  </div>
                ))
              )}

              {view.comms.length > 0 && (
                <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>커뮤니케이션 기록</div>
                  {view.comms.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, padding: "9px 0", borderBottom: "1px solid #F2F3F6" }}>
                      <span className="badge badge-comm" style={{ flex: "none" }}>{c.type}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13 }}><strong>{c.counterpart}</strong>{c.time ? <> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></> : null}</div>
                        <div style={{ fontSize: 13, color: "#3A4150" }}>{c.summary}</div>
                        {c.attachments.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                            {c.attachments.map((a) => {
                              const isUrl = !!a.url;
                              const label = isUrl ? a.url! : (a.fileName ?? "첨부");
                              return (
                                <a key={a.id} href={isUrl ? a.url! : `/api/comm-attachments/${a.id}`} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noreferrer" : undefined} style={reviewChipLink} title={label}>{isUrl ? "🔗" : "📎"} {label}{a.comment ? ` · ${a.comment}` : ""}</a>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </>
          )}
        </div>

        {/* 사이드 (디자인 §4.4: 야간 → 검수 이력 → AI 패널 순) */}
        <div className="rv-side">
          {!view.isVacation && (
            <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
              {view.nightReason ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>🌙 야간 업무</div>
                  <div style={{ fontSize: 13, color: "#6B5316", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 8, padding: "8px 10px" }}>{view.nightReason}</div>
                </>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>🌙 야간 업무 없음</span>
                  <span style={{ fontSize: 12, color: "#9AA1AE" }}>작성자가 야간 업무를 보고하지 않았습니다.</span>
                </div>
              )}
            </div>
          )}

          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>검수 이력</div>
            {view.events.length === 0 && <div style={{ fontSize: 13, color: "#9AA1AE" }}>이력이 없습니다.</div>}
            {view.events.map((e, i) => (
              <div key={i} style={{ display: "flex", gap: 10, paddingBottom: 12 }}>
                <div style={{ width: 10, height: 10, borderRadius: 9999, marginTop: 4, background: REJECT_KINDS.includes(e.kind) ? "#DC2626" : e.kind === "approved" ? "#1F9254" : "#2563EB" }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: REJECT_KINDS.includes(e.kind) ? "#DC2626" : "#1A1F2B" }}>{EVENT_LABEL[e.kind] ?? e.kind}</div>
                  <div style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{timeOf(e.at)}{e.actorName ? ` · ${e.actorName}` : ""}</div>
                  {e.comment && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{e.rejectTarget ? `[${e.rejectTarget}] ` : ""}{e.comment}</div>}
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#F3F0FE", border: "1px solid #E4DCFB", borderLeft: "3px solid #7C5CFC", borderRadius: 12, padding: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#5B3FD1" }}>✦ AI 분석 결과</div>
            <div style={{ fontSize: 11, color: "#8B7FC4", marginTop: 3 }}>이번 버전 미개발 · 영역 예약</div>
            <div style={{ marginTop: 12, border: "1px dashed #C9BCF6", borderRadius: 10, padding: 14, background: "rgba(255,255,255,.4)" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#7C5CFC", marginBottom: 12 }}>✦ 분석 결과 표시 영역</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {["효율성", "연속성", "연관성"].map((k) => (
                  <div key={k}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9AA1AE", marginBottom: 6 }}><span>{k}</span><span>—</span></div>
                    <div style={{ height: 6, background: "#EAE3FC", borderRadius: 9999 }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#8B7FC4", lineHeight: "16px", marginTop: 12 }}>효율성·연속성·연관성 분석은 다음 버전에서 제공됩니다. 검수는 AI 없이도 진행할 수 있어요.</div>
          </div>
        </div>
      </div>

      {/* 댓글 드로어 */}
      {drawer && <CommentDrawer key={drawer.id} task={drawer} role={view.viewerRole} onClose={() => setDrawer(null)} onChanged={() => router.refresh()} />}

      {/* 액션바 — 관리자(canAct=false)는 열람 전용 안내로 대체 */}
      {!view.canAct ? (
        (view.pending || view.reviewable) ? (
          <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px" }} data-testid="readonly-bar">
            <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#6B7280" }}>
              <span aria-hidden>👁</span>
              <span>관리자는 검수 내용을 <strong style={{ color: "#3A4150", fontWeight: 600 }}>열람만</strong> 할 수 있어요. 승인·반려는 해당 그룹의 그룹장이 수행합니다.</span>
            </div>
          </div>
        ) : null
      ) : view.pending ? (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            {!view.isVacation && cTotal > 0 && <span style={{ fontSize: 13, color: "#3A4150", fontWeight: 600 }} data-testid="action-summary">{actionSummary}</span>}
            {view.openRejectCount > 0 && <span style={{ fontSize: 13, color: "#B91C1C", fontWeight: 600 }} data-testid="open-reject-count">행 반려 {view.openRejectCount}건</span>}
            <div style={{ flex: 1 }} />
            <button onClick={() => setRejectOpen(true)} disabled={busy} data-testid="reject-open" style={{ height: 44, padding: "0 22px", border: "1px solid #F5C2C2", borderRadius: 8, background: "#fff", color: "#DC2626", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{view.openRejectCount > 0 ? "부분 반려로 회신" : "반려"}</button>
            <button onClick={approve} disabled={busy} data-testid="approve" style={{ height: 44, padding: "0 28px", border: "none", borderRadius: 8, background: "#1F9254", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>승인</button>
          </div>
        </div>
      ) : view.reviewable ? (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px" }} data-testid="plan-review-bar">
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#6B7280" }}>
            <span style={{ fontWeight: 600, color: "#3A4150" }}>계획 제출됨</span>
            <span>개별 업무 반려 또는 계획 전체 반려가 가능합니다.</span>
            {view.openRejectCount > 0 && <span style={{ color: "#B91C1C", fontWeight: 600 }} data-testid="open-reject-count">행 반려 {view.openRejectCount}건</span>}
            {view.canPlanReject && (
              <button onClick={() => { setPlanComment(""); setPlanRejectOpen(true); }} disabled={busy} data-testid="plan-reject-open" style={{ marginLeft: "auto", height: 38, padding: "0 18px", border: "1px solid #F5C2C2", borderRadius: 8, background: "#fff", color: "#DC2626", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>계획 반려</button>
            )}
          </div>
        </div>
      ) : null}

      {/* 계획 반려 모달 — 사유 ≥10자 필수 */}
      {planRejectOpen && (
        <div onClick={() => setPlanRejectOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 230, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="plan-reject-modal" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, padding: "20px 22px" }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>계획 반려</div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 14, lineHeight: "19px" }}>제출된 계획 전체를 반려합니다(개별 업무 완료 여부와 무관). 작성자에게 사유가 전달돼요.</div>
            <textarea value={planComment} onChange={(e) => setPlanComment(e.target.value.slice(0, 10000))} data-testid="plan-reject-reason" placeholder="계획을 반려하는 사유를 10자 이상 적어주세요." style={{ width: "100%", minHeight: 110, border: `1px solid ${planComment.trim().length > 0 && planComment.trim().length < 10 ? "#F5C2C2" : "#CBD0D9"}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: planComment.trim().length < 10 ? "#DC2626" : "#9AA1AE" }}>{planComment.trim().length < 10 ? `${10 - planComment.trim().length}자 더 입력` : `${planComment.trim().length}자`}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPlanRejectOpen(false)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
                <button onClick={planReject} disabled={busy || planComment.trim().length < 10} data-testid="plan-reject-submit" style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 8, background: planComment.trim().length >= 10 ? "#DC2626" : "#E2E5EB", color: planComment.trim().length >= 10 ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: planComment.trim().length >= 10 ? "pointer" : "default" }}>계획 반려하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 전체/회신 반려 모달 */}
      {rejectOpen && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto" }} data-testid="reject-modal">
            <div style={{ display: "flex", justifyContent: "space-between", padding: "18px 22px", borderBottom: "1px solid #EFF1F5" }}>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{view.openRejectCount > 0 ? "부분 반려로 회신" : "보고서 반려"}</span>
              <button onClick={() => setRejectOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA1AE", fontSize: 20 }}>✕</button>
            </div>
            <div style={{ padding: "18px 22px" }}>
              {view.openRejectCount > 0 && (
                <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 10, padding: "11px 14px", marginBottom: 16 }}>
                  <span style={{ color: "#DC2626" }}>↩</span>
                  <div style={{ fontSize: 13, color: "#B91C1C", lineHeight: "19px" }}>반려한 업무 {view.openRejectCount}건을 작성자에게 돌려보냅니다. 전체 코멘트는 선택입니다.</div>
                </div>
              )}
              {view.model === 1 && (
                <>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>대상 지목</label>
                  <select value={target} onChange={(e) => setTarget(e.target.value)} data-testid="reject-target" style={{ width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 10px", fontFamily: "inherit", fontSize: 14, marginBottom: 16, background: "#fff" }}>
                    {["전체", "오전", "오후", "야간"].map((t) => <option key={t}>{t}</option>)}
                  </select>
                </>
              )}
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 8 }}>자주 쓰는 사유</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
                {REJECT_TEMPLATES.map((t) => (
                  <button key={t} onClick={() => setComment(t)} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3A4150" }}>{t}</button>
                ))}
              </div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>전체 코멘트 {view.openRejectCount > 0 ? <span style={{ color: "#9AA1AE" }}>(선택)</span> : <span style={{ color: "#DC2626" }}>*</span>}</label>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} data-testid="reject-comment" placeholder="예) 오후 업무 계획이 누락되었습니다. 14시 이후 일정을 추가해 주세요." style={{ width: "100%", minHeight: 96, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 22px", borderTop: "1px solid #EFF1F5" }}>
              <button onClick={() => setRejectOpen(false)} style={{ height: 40, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>취소</button>
              <button onClick={reject} disabled={busy} data-testid="reject-submit" style={{ height: 40, padding: "0 18px", border: "none", borderRadius: 8, background: comment.trim() || view.openRejectCount > 0 ? "#DC2626" : "#E2E5EB", color: comment.trim() || view.openRejectCount > 0 ? "#fff" : "#9AA1AE", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>{view.openRejectCount > 0 ? "회신하기" : "반려하고 코멘트 전달"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
