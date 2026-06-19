"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { statusMeta } from "@/lib/domain/status";
import type { ReportStatus, WriteMode } from "@/lib/domain/status";
import { stepper2, writePrimaryLabel } from "@/lib/domain/report";
import CommentDrawer, { CommentButton, type DrawerTask } from "./CommentDrawer";

export interface TaskAttachment {
  id: number;
  kind: "file" | "url";
  fileName: string | null;
  url: string | null;
  comment: string | null;
}
export interface ReportTask {
  id: number;
  project: string | null;
  title: string;
  status: string;
  plannedStart: string | null;
  plannedDurationMin: number | null;
  doneTime: string | null; // KST 'HH:MM' (마감 시각)
  isNight: boolean;
  holdReason: string | null;
  rejectState: string | null;
  rejectComment: string | null;
  commentCount: number;
  commentUnread: boolean;
  attachments: TaskAttachment[];
}
export interface ReportView {
  reportId: number;
  date: string;
  dateLabel: string;
  mode: WriteMode;
  status: ReportStatus;
  viewerRole: string; // 그룹장 | 직원 | 관리자
  isVacation: boolean;
  vacationType: string | null;
  vacationComment: string | null;
  nightHas: boolean;
  nightReason: string | null;
  dailyComment: string | null;
  noCommunication: boolean;
  submittedAt: string | null;
  planSubmittedAt: string | null;
  todo: ReportTask[];
  am: ReportTask[];
  pm: ReportTask[];
  night: ReportTask[];
  comms: Array<{ id: number; type: string; counterpart: string; time: string | null; summary: string }>;
  events: Array<{ kind: string; actorName: string | null; comment: string | null; rejectTarget: string | null; at: string }>;
  recentTasks: Array<{ name: string; project: string | null; planned: number | null }>;
}

const VAC_TYPES = ["연차", "반차", "병가", "공가", "휴직", "기타"];
const VAC_REQUIRED = new Set(["병가", "휴직", "기타"]);
const COMM_TYPES = ["메일", "통화", "구두", "카톡", "회의", "메신저"];
const TIME_OPTS = ["08:30","09:00","09:30","10:00","10:30","11:00","11:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00"];
const DUR_OPTS: Array<[string, number]> = [["30분",30],["1시간",60],["1시간 30분",90],["2시간",120],["2시간 30분",150],["3시간",180],["4시간",240]];

const WORK_HEADER = {
  title: "오늘 할 일을 한 번에 적어두세요",
  sub: "각 업무를 마감하면 완료 시각에 따라 오전·오후로 자동 정리됩니다.",
};

export default function ReportEditor({ view }: { view: ReportView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [start, setStart] = useState("");
  const [dur, setDur] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [nightOn, setNightOn] = useState(view.nightHas);
  const [nightReason, setNightReason] = useState(view.nightReason ?? "");
  const [dailyComment, setDailyComment] = useState(view.dailyComment ?? "");
  const [vacationMode, setVacationMode] = useState(view.isVacation || view.mode === "vacation");
  const [vacType, setVacType] = useState(view.vacationType ?? "연차");
  const [vacReason, setVacReason] = useState(view.vacationComment ?? "");
  const [vacReasonCache, setVacReasonCache] = useState("");
  const [commType, setCommType] = useState("메일");
  const [commWho, setCommWho] = useState("");
  const [commTime, setCommTime] = useState("");
  const [commSummary, setCommSummary] = useState("");
  const [noComm, setNoComm] = useState(view.noCommunication);
  const [toast, setToast] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [carryOver, setCarryOver] = useState(false);
  const [drawer, setDrawer] = useState<DrawerTask | null>(null);
  const busyRef = useRef(false);

  // 서버 소유 상태는 router.refresh 후 새 props로 재동기화(로컬 stale 방지). 드래프트(코멘트/사유)는 유지.
  useEffect(() => setNightOn(view.nightHas), [view.nightHas]);
  useEffect(() => setNoComm(view.noCommunication), [view.noCommunication]);
  useEffect(() => setVacationMode(view.isVacation || view.mode === "vacation"), [view.isVacation, view.mode]);

  const openDrawer = (t: ReportTask, zone: string) =>
    setDrawer({ id: t.id, title: t.title, project: t.project, status: t.status, zone });

  const mode = view.mode;
  const readOnly = mode === "view";
  const isWork = mode === "work" && !vacationMode;
  const submitted = mode === "view";
  const doneCount =
    view.am.length + view.pm.length + view.night.filter((t) => t.status === "완결" || t.status === "지연").length;
  const stepper = stepper2({ submitted, todoCount: view.todo.length, doneCount });
  const primaryLabel = vacationMode
    ? vacType === "휴직"
      ? "휴직으로 제출"
      : "휴가로 제출"
    : writePrimaryLabel(view.status);

  const vacReasonRequired = VAC_REQUIRED.has(vacType);
  const filteredRecent = view.recentTasks
    .filter((s) => {
      const q = project.trim();
      if (!q) return true;
      return (s.project ?? "").includes(q) || s.name.includes(q);
    })
    .slice(0, 6);

  function flash(msg: string, ms = 2400) {
    setToast(msg);
    window.setTimeout(() => setToast(null), ms);
  }

  async function call(url: string, body: unknown, method = "POST") {
    if (busyRef.current) return null; // 동기 재진입 가드(더블클릭으로 2단계 건너뛰기 방지)
    busyRef.current = true;
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        alert(data.error ?? "처리에 실패했습니다.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function submitAdd() {
    if (!title.trim()) {
      alert("업무명을 입력해 주세요.");
      return;
    }
    const durMin = DUR_OPTS.find(([l]) => l === dur)?.[1] ?? null;
    const ok = await call(`/api/reports/${view.reportId}/tasks`, {
      title,
      project,
      plannedStart: start || null,
      plannedDurationMin: durMin,
    });
    if (ok) {
      setTitle("");
      setProject("");
      setStart("");
      setDur("");
      setSuggestOpen(false);
      setAddOpen(false);
      router.refresh();
    }
  }

  function pickRecent(name: string, proj: string | null) {
    setTitle(name);
    if (proj) setProject(proj);
    setSuggestOpen(false);
  }

  async function loadCarryover() {
    const ok = await call(`/api/reports/${view.reportId}/carryover`, {});
    if (ok) {
      flash(ok.count > 0 ? `어제 미완료 ${ok.count}건을 불러왔어요` : "불러올 어제 미완료 업무가 없습니다.");
      router.refresh();
    }
  }

  async function markDone(taskId: number) {
    const ok = await call(`/api/tasks/${taskId}/close`, {});
    if (ok) {
      flash("완료 시각으로 자동 분류했어요");
      router.refresh();
    }
  }

  async function reopen(taskId: number) {
    const ok = await call(`/api/tasks/${taskId}/reopen`, {});
    if (ok) {
      flash("다시 할 일로 이동했어요");
      router.refresh();
    }
  }

  async function addComm() {
    if (!commWho.trim() || !commSummary.trim()) {
      alert("상대와 요약을 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/communications`, {
      type: commType,
      counterpart: commWho,
      time: commTime || null,
      summary: commSummary,
    });
    if (ok) {
      setCommWho("");
      setCommTime("");
      setCommSummary("");
      setNoComm(false);
      router.refresh();
    }
  }

  async function saveDraft() {
    const ok = await call(
      `/api/reports/${view.reportId}`,
      { dailyComment, nightReason: nightReason || null, noCommunication: noComm },
      "PATCH",
    );
    if (ok) flash("임시저장되었습니다.");
  }

  async function toggleNoComm() {
    const next = !noComm;
    setNoComm(next);
    await call(`/api/reports/${view.reportId}`, { noCommunication: next }, "PATCH");
  }

  // 야간 토글은 서버(night_has)에 즉시 반영 — 새로고침 후 버킷/토글 desync 방지
  async function setNight(on: boolean) {
    setNightOn(on);
    await call(`/api/reports/${view.reportId}`, { nightHas: on, nightReason: nightReason || null }, "PATCH");
  }

  function onChangeVacType(v: string) {
    const wasReq = VAC_REQUIRED.has(vacType);
    const nowReq = VAC_REQUIRED.has(v);
    if (wasReq && !nowReq) {
      setVacReasonCache(vacReason);
    } else if (!wasReq && nowReq && vacReasonCache) {
      setVacReason(vacReasonCache);
    }
    setVacType(v);
  }

  async function doVacationSubmit() {
    if (vacReasonRequired && !vacReason.trim()) {
      alert("선택한 휴가 유형은 사유가 필수입니다.");
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/advance`, {
      vacationType: vacType,
      vacationComment: vacReason || null,
      expectedStatus: view.status,
    });
    if (ok) router.refresh();
  }

  // 제출 1차 버튼
  async function onPrimary() {
    if (vacationMode) return doVacationSubmit();
    if (mode === "rejected") return setSubmitOpen(true);
    // work: 미작성/작성중 → 계획 제출(직접), 계획제출 → 최종 제출(모달)
    if (view.status === "계획제출") {
      setSubmitOpen(true);
      return;
    }
    // 1차 계획 제출
    if (view.todo.length + doneCount === 0) {
      alert("계획을 제출하려면 업무를 1개 이상 추가해 주세요.");
      return;
    }
    if (nightOn && !nightReason.trim()) {
      alert("야간 업무 사유를 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/advance`, {
      nightBranch: nightOn ? "yes" : "no",
      nightReason: nightReason || null,
      dailyComment,
      expectedStatus: view.status,
    });
    if (ok) {
      flash("계획을 제출했어요. 이제 검수자가 개별 업무를 확인할 수 있어요.", 3200);
      router.refresh();
    }
  }

  async function confirmSubmit() {
    if (nightOn && !nightReason.trim()) {
      alert("야간 업무 사유를 입력해 주세요.");
      return;
    }
    // 반려 재제출은 이월 무의미 → carryover 생략. 계획제출→최종 제출만 이월 적용.
    const ok = await call(`/api/reports/${view.reportId}/advance`, {
      nightBranch: nightOn ? "yes" : "no",
      nightReason: nightReason || null,
      dailyComment,
      carryover: mode === "rejected" ? false : carryOver,
      expectedStatus: view.status,
    });
    setSubmitOpen(false);
    if (ok) router.refresh();
  }

  const incompleteN = view.todo.length;

  return (
    <div data-report-id={view.reportId} data-report-mode={mode}>
      {/* 페이지 헤더 */}
      <div style={{ background: "#fff", borderBottom: "1px solid #E2E5EB", padding: "14px 24px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <span style={{ fontSize: 17, fontWeight: 700 }}>일일 업무 보고서</span>
        <span style={{ fontSize: 14, color: "#3A4150", fontWeight: 600 }} className="tnum">{view.dateLabel}</span>
        <div style={{ flex: 1 }} />
        <span data-testid="report-status" className="badge" style={{ color: statusMeta(view.status).main, background: statusMeta(view.status).bg, border: `1px solid ${statusMeta(view.status).line}` }}>
          {view.status}
        </span>
      </div>

      <div style={{ maxWidth: 808, margin: "0 auto", padding: "24px 24px 120px" }}>
        {(() => {
          const rejectComment = view.events.findLast((e) => e.kind === "rejected")?.comment;
          let banner: { icon: string; title: string; sub: string; bg: string; line: string; fg: string } | null = null;
          if (mode === "rejected")
            banner = { icon: "↩", title: "그룹장이 보고서를 반려했습니다.", sub: rejectComment ? `그룹장 코멘트: ${rejectComment}` : "반려된 업무만 수정·재마감한 뒤 다시 제출해 주세요.", bg: "#FCEBEB", line: "#F5C2C2", fg: "#B91C1C" };
          else if (mode === "view")
            banner = { icon: "⧗", title: "제출 완료 · 검수 대기 중입니다.", sub: "관리자 검수가 끝나면 결과를 알려드립니다. 현재는 읽기 전용입니다.", bg: "#FBF4DA", line: "#EFE0A6", fg: "#8A6508" };
          else if (view.status === "계획제출")
            banner = { icon: "▸", title: "계획을 제출했어요.", sub: "검수자가 개별 업무를 확인할 수 있습니다. 하루를 마무리한 뒤 최종 제출해 주세요.", bg: "#FBF4DA", line: "#EFE0A6", fg: "#8A6508" };
          if (!banner) return null;
          return (
            <div data-testid="mode-banner" style={{ display: "flex", gap: 10, alignItems: "flex-start", borderRadius: 10, borderLeft: `3px solid ${banner.fg}`, padding: "12px 14px", marginBottom: 16, background: banner.bg, border: `1px solid ${banner.line}`, color: banner.fg }}>
              <span style={{ fontSize: 16, fontWeight: 700, lineHeight: "20px" }}>{banner.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, lineHeight: "20px" }}>{banner.title}</div>
                <div style={{ fontSize: 13, opacity: 0.9, lineHeight: "19px", marginTop: 2 }}>{banner.sub}</div>
              </div>
            </div>
          );
        })()}

        {/* 2단계 스테퍼 */}
        <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "18px 22px", marginBottom: 14, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", maxWidth: 460, margin: "0 auto" }}>
            {stepper.map((n, i) => {
              const node = n.done ? { bg: "#1F9254", border: "#1F9254", fg: "#fff" } : n.current ? { bg: "#fff", border: "#3B5BDB", fg: "#3B5BDB" } : { bg: "#F1F2F4", border: "#CBD0D9", fg: "#9AA1AE" };
              const line = n.done ? "#1F9254" : "#3B5BDB";
              return (
                <div key={n.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <div style={{ flex: 1, height: 2, background: i === 0 ? "transparent" : line }} />
                    <div style={{ width: 26, height: 26, borderRadius: 9999, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", background: node.bg, border: `2px solid ${node.border}`, color: node.fg, fontSize: 12, fontWeight: 700 }}>{n.done ? "✓" : ""}</div>
                    <div style={{ flex: 1, height: 2, background: i === 0 ? (n.done ? "#1F9254" : "#3B5BDB") : "transparent" }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: n.done ? "#1A1F2B" : n.current ? "#3B5BDB" : "#9AA1AE", marginTop: 8 }}>{n.label}</div>
                  <div style={{ fontSize: 11, color: "#9AA1AE", marginTop: 2 }} className="tnum">{n.sub}</div>
                </div>
              );
            })}
          </div>
          <div style={{ textAlign: "center", fontSize: 12, color: "#9AA1AE", marginTop: 12 }}>
            오전/오후는 단계가 아니라 완료 시각 분류입니다
          </div>
        </div>

        {/* 휴가 모드 (F2) */}
        {vacationMode ? (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 22, marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }} data-testid="vacation-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>오늘은 휴가로 처리할까요?</div>
              {!readOnly && !view.isVacation && (
                <button onClick={() => setVacationMode(false)} data-testid="exit-vacation" style={btnGhost}>← 업무 작성으로</button>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>휴가 유형과 사유만 입력하면 됩니다.</div>

            <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 7 }}>유형 <span style={{ color: "#DC2626" }}>*</span></label>
            <select value={vacType} disabled={readOnly} onChange={(e) => onChangeVacType(e.target.value)} data-testid="vac-type" style={{ width: "100%", maxWidth: 240, height: 44, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, color: "#3A4150", background: "#fff", marginBottom: 18, outline: "none" }}>
              {VAC_TYPES.map((v) => <option key={v}>{v}</option>)}
            </select>

            <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 14, fontWeight: 600, marginBottom: 5 }}>
              사유 {vacReasonRequired ? <span style={{ color: "#DC2626" }}>*</span> : <span style={{ fontSize: 13, fontWeight: 700, color: "#9AA1AE" }}>(선택)</span>}
            </label>
            <textarea value={vacReason} disabled={readOnly} onChange={(e) => setVacReason(e.target.value.slice(0, 10000))} data-testid="vac-reason" placeholder={vacType === "휴직" ? "휴직 기간과 인수인계 내용을 적어주세요." : "필요 시 사유나 인수인계 내용을 적어주세요."} style={{ width: "100%", minHeight: 160, border: `1px solid ${(vacReasonRequired && !vacReason.trim()) || vacReason.length >= 10000 ? "#F5C2C2" : "#CBD0D9"}`, borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none" }} />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 7, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "#9AA1AE" }}>증빙·인수인계가 있으면 함께 첨부해 주세요.</span>
              <span style={{ fontSize: 12, fontWeight: 600, color: vacReason.length >= 10000 ? "#DC2626" : "#9AA1AE" }} className="tnum">{vacReason.length} / 10,000</span>
            </div>
            {vacReason.length >= 10000 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#DC2626", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 7, padding: "7px 10px", marginTop: 8 }}>⚠ 최대 10,000자까지 입력할 수 있어요.</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#8A6508", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 7, padding: "7px 10px", marginTop: 10 }}>ⓘ 이 사유는 승인자(그룹장)에게도 함께 표시됩니다.</div>
          </div>
        ) : (
          <>
            {/* 오늘 할 일 (work 모드) */}
            {isWork && (
              <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderLeft: "3px solid #3B5BDB", borderRadius: 12, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#3B5BDB", background: "#EEF2FF", padding: "3px 9px", borderRadius: 9999 }}>오늘 할 일</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>남은 {view.todo.length} · 완료 {doneCount}</span>
                  <div style={{ flex: 1, minWidth: 4 }} />
                  <button onClick={() => setVacationMode(true)} data-testid="go-vacation" style={{ ...btnGhost, fontSize: 12, padding: "6px 12px" }}>휴가로 전환</button>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "26px", marginTop: 10 }}>{WORK_HEADER.title}</div>
                <div style={{ fontSize: 13, lineHeight: "20px", color: "#6B7280", marginTop: 3 }}>{WORK_HEADER.sub}</div>

                {/* 미완료 리스트 */}
                <div style={{ marginTop: 8 }}>
                  {view.todo.map((t) => (
                    <TaskRow key={t.id} t={t} busy={busy} onMarkDone={() => markDone(t.id)} onComment={() => openDrawer(t, "오늘 할 일")} />
                  ))}
                  {view.todo.length === 0 && (
                    <div style={{ textAlign: "center", padding: "22px 0" }}>
                      <div style={{ fontSize: 13, color: "#6B7280" }}>남은 할 일이 없어요. 모두 마감했습니다 👍</div>
                    </div>
                  )}
                </div>

                {/* 업무 추가 */}
                {!addOpen ? (
                  <>
                    <button onClick={() => setAddOpen(true)} data-testid="add-task" style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "1px dashed #CBD0D9", borderRadius: 8, padding: "9px 12px", width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3B5BDB", marginTop: 12 }}>＋ 업무 추가</button>
                    <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button onClick={loadCarryover} disabled={busy} data-testid="carryover" style={chip}>↻ 어제 미완료 불러오기</button>
                      {view.recentTasks.length > 0 && (
                        <button onClick={() => { setAddOpen(true); setSuggestOpen(true); }} data-testid="repeat-task" style={chip}>반복 업무</button>
                      )}
                    </div>
                  </>
                ) : (
                  <div style={{ border: "1px solid #CBD0D9", borderRadius: 10, background: "#FBFCFD", padding: 14, marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>업무 추가</div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>프로젝트명 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                    <input value={project} onChange={(e) => { setProject(e.target.value); setSuggestOpen(true); }} onFocus={() => setSuggestOpen(true)} data-testid="add-project" placeholder="프로젝트명을 입력하면 최근 업무를 불러올 수 있어요" style={inp} />
                    {suggestOpen && filteredRecent.length > 0 && (
                      <div style={{ border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", marginTop: 8, overflow: "hidden" }} data-testid="recent-suggest">
                        <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", padding: "8px 10px", background: "#F7F8FA", borderBottom: "1px solid #EFF1F5" }}>최근 진행한 업무</div>
                        {filteredRecent.map((s, i) => (
                          <button key={i} onClick={() => pickRecent(s.name, s.project)} data-testid="recent-item" style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderBottom: "1px solid #F2F3F6", padding: "9px 10px", cursor: "pointer", fontFamily: "inherit" }}>
                            <span style={{ fontSize: 13, color: "#1A1F2B", flex: 1 }}>{s.name}</span>
                            {s.project && <span style={{ fontSize: 11, color: "#2F49B0" }}>{s.project}</span>}
                            {s.planned && <span style={{ fontSize: 11, color: "#9AA1AE" }} className="tnum">예정 {s.planned}분</span>}
                            <span style={{ fontSize: 12, color: "#3B5BDB", fontWeight: 600 }}>＋ 불러오기</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>업무명 <span style={{ color: "#DC2626" }}>*</span></label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="add-title" placeholder="업무명을 입력해 주세요" style={inp} />
                    <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                      <div style={{ flex: 1, minWidth: 130 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>예정 시간 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                        <select value={start} onChange={(e) => setStart(e.target.value)} style={{ ...inp, padding: "0 10px" }}>
                          <option value="">시작 시각 선택</option>
                          {TIME_OPTS.map((t) => <option key={t}>{t}</option>)}
                        </select>
                      </div>
                      <div style={{ flex: 1, minWidth: 130 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>소요 시간 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                        <select value={dur} onChange={(e) => setDur(e.target.value)} style={{ ...inp, padding: "0 10px" }}>
                          <option value="">소요 시간 선택</option>
                          {DUR_OPTS.map(([l]) => <option key={l}>{l}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: "#9AA1AE", marginTop: 6 }}>여기 입력한 예정 시간은 계획이며, 오전/오후는 마감 시각으로 자동 결정됩니다.</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                      <button onClick={() => { setAddOpen(false); setSuggestOpen(false); }} data-testid="add-cancel" style={btnGhost}>취소</button>
                      <button onClick={submitAdd} disabled={busy} data-testid="add-submit" style={btnPrimary}>추가</button>
                    </div>
                  </div>
                )}

                {/* 야간 독립 토글 */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #EFF1F5", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>야간 업무가 있나요?</span>
                  <span style={{ fontSize: 12, color: "#9AA1AE" }}>오전·오후와 무관하게 독립적으로 설정합니다.</span>
                  <div style={{ flex: 1, minWidth: 4 }} />
                  <div style={{ display: "inline-flex", background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: 3 }}>
                    <button onClick={() => setNight(false)} data-testid="night-off" style={pill(!nightOn)}>없음</button>
                    <button onClick={() => setNight(true)} data-testid="night-on" style={pill(nightOn)}>있음</button>
                  </div>
                </div>
                {nightOn && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>야간 업무 사유 <span style={{ color: "#DC2626" }}>*</span></label>
                    <textarea value={nightReason} onChange={(e) => setNightReason(e.target.value)} data-testid="night-reason" placeholder="예) PG사 정기 점검 대응으로 21:30까지 야간 대기가 필요합니다." style={{ width: "100%", minHeight: 72, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none" }} />
                  </div>
                )}
              </div>
            )}

            {/* 반려/제출 모드: 미완료(할 일) 행도 보이게 — 반려 행 수정 동선 */}
            {!isWork && view.todo.length > 0 && (
              <div data-testid="todo-readonly" style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>미완료 · 진행 중</span>
                  <div style={{ flex: 1 }} />
                  <span className="badge" style={{ color: "#3A4150", background: "#F1F2F4", border: "1px solid #D9DCE2" }}>{view.todo.length}건</span>
                </div>
                <div style={{ padding: "6px 18px 14px" }}>
                  {view.todo.map((t) => (
                    <TaskRow key={t.id} t={t} busy={busy} rejectedMode={mode === "rejected"} onMarkDone={() => markDone(t.id)} onComment={() => openDrawer(t, "오늘 할 일")} />
                  ))}
                </div>
              </div>
            )}

            {/* 결과 바구니: 오전 / 오후 / 야간 */}
            <ResultBucket testid="result-bucket-am" zone="오전" icon="" name="오전" range="00:00 ~ 11:59" tasks={view.am} editable={!readOnly} rejectedMode={mode === "rejected"} busy={busy} onReopen={reopen} onComment={openDrawer} emptyText="아직 오전에 마감한 업무가 없습니다." />
            <ResultBucket testid="result-bucket-pm" zone="오후" icon="" name="오후" range="12:00 ~ 19:59" tasks={view.pm} editable={!readOnly} rejectedMode={mode === "rejected"} busy={busy} onReopen={reopen} onComment={openDrawer} emptyText="아직 오후에 마감한 업무가 없습니다." />
            {(nightOn || view.night.length > 0) && (
              <ResultBucket testid="result-bucket-night" zone="야간" icon="🌙 " name="야간" range="20:00 ~" tasks={view.night} editable={!readOnly} rejectedMode={mode === "rejected"} busy={busy} onReopen={reopen} onComment={openDrawer} emptyText="마감한 야간 업무가 정리됩니다." />
            )}
          </>
        )}

        {/* 커뮤니케이션 기록 */}
        {!vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }} data-testid="comm-section">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>커뮤니케이션 기록</div>
            {view.comms.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F2F3F6" }} data-testid="comm-row">
                <span className="badge badge-comm" style={{ flex: "none" }}>{c.type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#1A1F2B" }}><strong style={{ fontWeight: 600 }}>{c.counterpart}</strong>{c.time ? <> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></> : null}</div>
                  <div style={{ fontSize: 13, color: "#3A4150", marginTop: 2 }}>{c.summary}</div>
                </div>
              </div>
            ))}
            {!readOnly && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <select value={commType} onChange={(e) => setCommType(e.target.value)} data-testid="comm-type" style={{ ...inp, width: 96, flex: "none" }}>
                    {COMM_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <input value={commWho} onChange={(e) => setCommWho(e.target.value)} placeholder="상대" data-testid="comm-who" style={{ ...inp, flex: 1, minWidth: 90 }} />
                  <select value={commTime} onChange={(e) => setCommTime(e.target.value)} style={{ ...inp, width: 110, flex: "none" }}>
                    <option value="">시각</option>
                    {TIME_OPTS.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input value={commSummary} onChange={(e) => setCommSummary(e.target.value)} placeholder="요약 (예: 환불 정책 변경분 공유)" data-testid="comm-summary" style={{ ...inp, flex: 1 }} />
                  <button onClick={addComm} disabled={busy} data-testid="comm-add" style={btnPrimary}>추가</button>
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={noComm} onChange={toggleNoComm} data-testid="no-comm" />
                  <span style={{ fontSize: 13, color: "#3A4150" }}>오늘 커뮤니케이션 없음</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* 일일 코멘트 */}
        {!vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontSize: 15, fontWeight: 600 }}>일일 코멘트</span>
              <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{dailyComment.length} / 500</span>
            </div>
            <textarea value={dailyComment} disabled={readOnly} onChange={(e) => setDailyComment(e.target.value.slice(0, 500))} data-testid="daily-comment" placeholder="오늘 업무에 대한 한 줄 정리나 내일 우선순위를 적어주세요." style={{ width: "100%", minHeight: 96, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none" }} />
          </div>
        )}
      </div>

      {/* 토스트 */}
      {toast && (
        <div data-testid="toast" style={{ position: "fixed", left: "50%", bottom: 84, transform: "translateX(-50%)", zIndex: 210, background: "#1A1F2B", color: "#fff", fontSize: 13, fontWeight: 600, padding: "10px 16px", borderRadius: 9999, boxShadow: "0 6px 18px rgba(16,24,40,.24)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#7FE3A6" }}>✓</span>{toast}
        </div>
      )}

      {/* 제출 확인 모달 */}
      {submitOpen && (
        <div onClick={() => setSubmitOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 220, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="submit-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 420 }}>
            <div style={{ padding: "20px 22px 0" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>오늘 보고를 제출할까요?</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>제출하면 검수 대기 상태가 되고, 보고서는 읽기 전용으로 잠깁니다.</div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 10, padding: "12px 14px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1F2B" }}>완료 {doneCount} · 남은 {incompleteN}</span>
              </div>
              {incompleteN > 0 && (
                <>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 10, padding: "11px 14px", marginTop: 10 }}>
                    <span style={{ color: "#D97706" }}>⚠</span>
                    <div style={{ fontSize: 13, color: "#B45309", lineHeight: "19px" }}>미완료 {incompleteN}건이 있습니다. 이대로 제출하면 미완 상태로 보고됩니다.</div>
                  </div>
                  <button onClick={() => setCarryOver((v) => !v)} data-testid="carry-toggle" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: carryOver ? "#EEF2FF" : "#fff", border: `1px solid ${carryOver ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 10, padding: "11px 14px", marginTop: 8, cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: carryOver ? "#3B5BDB" : "#fff", border: `1.5px solid ${carryOver ? "#3B5BDB" : "#CBD0D9"}`, color: "#fff", fontSize: 12, fontWeight: 700 }}>{carryOver ? "✓" : ""}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#3A4150" }}>미완료 {incompleteN}건을 <span style={{ color: "#3B5BDB" }}>내일 할 일로 이월</span></span>
                  </button>
                </>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={() => setSubmitOpen(false)} style={btnGhost}>취소</button>
                <button onClick={confirmSubmit} disabled={busy} data-testid="submit-confirm" style={btnPrimary}>제출하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 댓글 드로어 (task별 remount로 stale 방지) */}
      {drawer && (
        <CommentDrawer key={drawer.id} task={drawer} role={view.viewerRole} onClose={() => setDrawer(null)} onChanged={() => router.refresh()} />
      )}

      {/* 액션바 */}
      {!readOnly && (
        <div style={{ position: "sticky", bottom: 0, background: "rgba(255,255,255,.94)", borderTop: "1px solid #E2E5EB", padding: "12px 24px", display: "flex", gap: 12 }}>
          <div style={{ maxWidth: 808, width: "100%", margin: "0 auto", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }} />
            {!vacationMode && (
              <button onClick={saveDraft} disabled={busy} data-testid="save-draft" style={{ height: 44, padding: "0 18px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>임시저장</button>
            )}
            <button onClick={onPrimary} disabled={busy} data-testid="primary-action" style={{ height: 44, padding: "0 22px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>{primaryLabel}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RejectBand({ comment }: { comment: string | null }) {
  return (
    <div data-testid="reject-band" style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: "#B91C1C", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 7, padding: "7px 10px", marginTop: 8 }}>
      <span style={{ fontWeight: 700 }}>↩ 반려됨</span>
      <span style={{ flex: 1 }}>{comment ?? "이 업무를 수정·재마감해 주세요."}</span>
    </div>
  );
}

function TaskRow({ t, busy, rejectedMode = false, onMarkDone, onComment }: { t: ReportTask; busy: boolean; rejectedMode?: boolean; onMarkDone: () => void; onComment: () => void }) {
  const m = statusMeta(t.status);
  const rejected = t.rejectState === "반려";
  const closeable = !rejectedMode || rejected; // 반려 모드에선 반려 행만 마감 가능
  const inProgress = t.status === "진행중";
  return (
    <div data-testid="task-row" data-task-id={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid #F2F3F6", boxShadow: rejected ? "inset 3px 0 0 #3B5BDB" : "none", paddingLeft: rejected ? 10 : 0 }}>
      <div style={{ width: 20, height: 20, borderRadius: 9999, flex: "none", marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: `1.5px solid ${inProgress ? "#2563EB" : "#CBD0D9"}` }}>
        {inProgress && <span style={{ width: 8, height: 8, borderRadius: 9999, background: "#2563EB" }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1F2B" }}>{t.title}</span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status}</span>
          {t.isNight && <span style={{ fontSize: 11, fontWeight: 600, color: "#8A6508", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 6, padding: "2px 7px" }}>🌙 야간</span>}
        </div>
        {(t.plannedStart || t.plannedDurationMin != null) && (
          <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 4 }} className="tnum">
            {t.plannedStart ? `예정 ${t.plannedStart}` : ""}{t.plannedDurationMin != null ? ` · ${t.plannedDurationMin}분` : ""}
          </div>
        )}
        {t.holdReason && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#B45309", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 6, padding: "3px 8px", marginTop: 6 }}>지연 사유 · {t.holdReason}</div>}
        {rejected && <RejectBand comment={t.rejectComment} />}
      </div>
      {closeable && (
        <button data-id={t.id} onClick={onMarkDone} disabled={busy} data-testid={`mark-done-${t.id}`} style={{ flex: "none", background: "#3B5BDB", border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 14px", marginTop: 1 }}>마감</button>
      )}
      <CommentButton count={t.commentCount} unread={t.commentUnread} onClick={onComment} />
    </div>
  );
}

function ResultBucket({ testid, zone, icon, name, range, tasks, editable, rejectedMode = false, busy, onReopen, onComment, emptyText }: { testid: string; zone: string; icon: string; name: string; range: string; tasks: ReportTask[]; editable: boolean; rejectedMode?: boolean; busy: boolean; onReopen: (id: number) => void; onComment: (t: ReportTask, zone: string) => void; emptyText: string }) {
  return (
    <div data-testid={testid} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, boxShadow: "0 1px 3px rgba(16,24,40,.08)", marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{icon}{name}</span>
        <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{range}</span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <span className="badge" style={{ color: "#3A4150", background: "#F1F2F4", border: "1px solid #D9DCE2" }}>{tasks.length}건</span>
      </div>
      <div style={{ padding: "6px 18px 14px" }}>
        {tasks.length === 0 ? (
          <div style={{ border: "1px dashed #E2E5EB", borderRadius: 8, padding: 16, textAlign: "center", fontSize: 13, color: "#9AA1AE", marginTop: 8 }}>{emptyText}</div>
        ) : (
          tasks.map((t) => {
            const m = statusMeta(t.status);
            const delay = t.status === "지연";
            const rejected = t.rejectState === "반려";
            const canReopen = editable && (!rejectedMode || rejected); // 반려 모드: 반려 행만 마감 취소
            return (
              <div key={t.id} data-testid="task-row" data-task-id={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "12px 0", borderBottom: "1px solid #F2F3F6", boxShadow: rejected ? "inset 3px 0 0 #3B5BDB" : "none", paddingLeft: rejected ? 10 : 0 }}>
                <div style={{ width: 20, height: 20, borderRadius: 9999, flex: "none", marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: delay ? "#fff" : "#1F9254", border: `1.5px solid ${delay ? "#F5C2C2" : "#1F9254"}`, color: delay ? "#DC2626" : "#fff", fontSize: 11, fontWeight: 700 }}>{delay ? "!" : "✓"}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
                    <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1F2B" }}>{t.title}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status}</span>
                    {t.doneTime && <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F1F2F4", borderRadius: 6, padding: "2px 7px" }} className="tnum">✓ 마감 {t.doneTime}</span>}
                  </div>
                  {t.holdReason && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#B45309", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 6, padding: "3px 8px", marginTop: 6 }}>지연 사유 · {t.holdReason}</div>}
                  {rejected && <RejectBand comment={t.rejectComment} />}
                </div>
                {canReopen && (
                  <button data-id={t.id} onClick={() => onReopen(t.id)} disabled={busy} data-testid={`reopen-${t.id}`} style={{ flex: "none", background: "#fff", border: "1px solid #CBD0D9", color: "#6B7280", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "5px 11px", marginTop: 1 }}>마감 취소</button>
                )}
                <CommentButton count={t.commentCount} unread={t.commentUnread} onClick={() => onComment(t, zone)} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const inp: React.CSSProperties = { width: "100%", height: 40, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none", background: "#fff" };
const btnGhost: React.CSSProperties = { border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "7px 14px", cursor: "pointer" };
const btnPrimary: React.CSSProperties = { border: "none", background: "#3B5BDB", color: "#fff", borderRadius: 8, fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "8px 18px", cursor: "pointer" };
const chip: React.CSSProperties = { background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: "5px 11px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3A4150" };

function pill(active: boolean): React.CSSProperties {
  return { border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, padding: "6px 16px", borderRadius: 9999, background: active ? "#3B5BDB" : "transparent", color: active ? "#fff" : "#3A4150" };
}
