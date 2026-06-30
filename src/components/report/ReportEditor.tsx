"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { statusMeta } from "@/lib/domain/status";
import type { ReportStatus, WriteMode } from "@/lib/domain/status";
import { writePrimaryLabel } from "@/lib/domain/report";
import CommentDrawer, { CommentButton, type DrawerTask } from "./CommentDrawer";
import TaskDescBox from "./TaskDescBox";

export interface TaskAttachment {
  id: number;
  kind: "file" | "url";
  fileName: string | null;
  url: string | null;
  comment: string | null;
}

type AttachProp = {
  open: boolean;
  onToggle: () => void;
  onUploadFile: (file: File) => void;
  onUploadUrl: (url: string) => void;
};
export interface ReportTask {
  id: number;
  project: string | null;
  title: string;
  status: string;
  plannedStart: string | null;
  plannedDurationMin: number | null;
  doneTime: string | null; // KST 'HH:MM' (마감 시각)
  actualDurationMin: number | null; // 실제 소요(분)
  isNight: boolean;
  holdReason: string | null;
  description: string | null; // 업무 설명(상세)
  rejectState: string | null;
  rejectComment: string | null;
  commentCount: number;
  commentUnread: boolean;
  commentLeaderUnread: boolean; // 마지막 댓글이 그룹장(미확인) → 파란 '미확인' 배지
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
  updatedAt: string | null; // 마지막 저장 시각
  todo: ReportTask[];
  am: ReportTask[];
  pm: ReportTask[];
  night: ReportTask[];
  // AI 그룹: 오전/오후/야간 대신 24시간 단일 완료 타임라인. isAi면 am/pm/night 대신 aiDone 사용.
  isAi: boolean;
  aiDone: ReportTask[];
  submitDueHm: string | null; // 'HH:MM' 자동제출(마감) 시각, null=없음. 마감 임박 라벨용.
  comms: Array<{ id: number; type: string; counterpart: string; time: string | null; summary: string; attachments: Array<{ id: number; fileName: string | null; url: string | null; comment: string | null }> }>;
  events: Array<{ kind: string; actorName: string | null; comment: string | null; rejectTarget: string | null; at: string }>;
  recentTasks: Array<{ name: string; project: string | null; planned: number | null }>;
  // 직전 보고서의 미완료 업무 중 아직 안 가져온 후보(‘미완료 업무 불러오기’ 팝업)
  carryoverCandidates: Array<{ id: number; project: string | null; title: string }>;
  // 관리에서 등록한 보관 제외 프로젝트(작성 드롭다운 제안, 고객명 동반). 자유 텍스트 입력은 병행 유지(B2).
  projectOptions: { name: string; custName: string | null }[];
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

// 디자인: 소요시간 약식 표기(2h / 30m / 2h 10m)
function fmtDur(min: number | null): string {
  if (min == null) return "";
  const h = Math.floor(min / 60), m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export default function ReportEditor({ view }: { view: ReportView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  // 프로젝트명 → 고객명 매핑(작성 행 칩에 고객명 동반 표시용)
  const projCust = new Map((view.projectOptions ?? []).map((p) => [p.name, p.custName] as const));
  const [desc, setDesc] = useState("");
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
  const commFileRef = useRef<HTMLInputElement>(null);
  const [commAddOpen, setCommAddOpen] = useState(false); // 디자인: '＋ 커뮤니케이션 기록 추가'로 폼 토글
  // 디자인: '첨부 · 링크 (선택)' — 파일/URL을 여러 개(각각 설명) 추가, 행별 제거
  const [pendingFiles, setPendingFiles] = useState<Array<{ file: File; note: string }>>([]);
  const [pendingUrls, setPendingUrls] = useState<Array<{ url: string; note: string }>>([]);
  // 업무 추가 폼의 첨부·링크(파일/URL 다중 + 설명)
  const taskFileRef = useRef<HTMLInputElement>(null);
  const [taskFiles, setTaskFiles] = useState<Array<{ file: File; note: string }>>([]);
  const [taskUrls, setTaskUrls] = useState<Array<{ url: string; note: string }>>([]);
  const [attachOpen, setAttachOpen] = useState<{ kind: "task" | "comm"; id: number } | null>(null); // 행별 '＋ 첨부파일·코멘트' 에디터
  const [noComm, setNoComm] = useState(view.noCommunication);
  const [toast, setToast] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [carryOver, setCarryOver] = useState(false);
  // '미완료 업무 불러오기' 팝업: 후보 선택
  const [carryPickOpen, setCarryPickOpen] = useState(false);
  const [carrySel, setCarrySel] = useState<Set<number>>(new Set());
  const [drawer, setDrawer] = useState<DrawerTask | null>(null);
  const [editing, setEditing] = useState<ReportTask | null>(null);
  const [eTitle, setETitle] = useState("");
  const [eProject, setEProject] = useState("");
  const [eDesc, setEDesc] = useState("");
  const [eStart, setEStart] = useState("");
  const [eDur, setEDur] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const busyRef = useRef(false);

  // 서버 소유 상태는 router.refresh 후 새 props로 재동기화(로컬 stale 방지). 드래프트(코멘트/사유)는 유지.
  useEffect(() => setNightOn(view.nightHas), [view.nightHas]);
  useEffect(() => setNoComm(view.noCommunication), [view.noCommunication]);
  useEffect(() => setVacationMode(view.isVacation || view.mode === "vacation"), [view.isVacation, view.mode]);

  // '오늘 할 일' 드래그 재정렬 — 포인터 기반(마우스+터치 모두). 서버 갱신 시 로컬 오버라이드 폐기.
  // 주의: task id는 bigint(런타임 문자열)이므로 모든 비교/키는 String으로 정규화한다.
  const [localTodo, setLocalTodo] = useState<ReportTask[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOrderRef = useRef<ReportTask[]>([]);
  const todoRows = localTodo ?? view.todo;
  useEffect(() => setLocalTodo(null), [view.todo]);
  function startDrag(taskId: number | string, e: React.PointerEvent) {
    e.preventDefault();
    dragOrderRef.current = [...todoRows];
    setLocalTodo([...todoRows]);
    setDragId(String(taskId));
  }
  useEffect(() => {
    if (dragId == null) return;
    const onMove = (e: PointerEvent) => {
      const el = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest("[data-todo-id]") as HTMLElement | null;
      if (!el) return;
      const overId = el.getAttribute("data-todo-id");
      if (!overId || overId === dragId) return;
      const cur = dragOrderRef.current;
      const moved = cur.find((t) => String(t.id) === dragId);
      if (!moved) return;
      const rest = cur.filter((t) => String(t.id) !== dragId);
      let at = rest.findIndex((t) => String(t.id) === overId);
      if (at < 0) return;
      if (e.clientY > el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2) at += 1;
      const next = [...rest.slice(0, at), moved, ...rest.slice(at)];
      if (next.map((t) => String(t.id)).join(",") !== cur.map((t) => String(t.id)).join(",")) {
        dragOrderRef.current = next;
        setLocalTodo(next);
      }
    };
    const onUp = async () => {
      const finalOrder = dragOrderRef.current;
      setDragId(null);
      if (finalOrder.map((t) => String(t.id)).join(",") === view.todo.map((t) => String(t.id)).join(",")) { setLocalTodo(null); return; }
      try {
        await fetch(`/api/reports/${view.reportId}/reorder`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ taskIds: finalOrder.map((t) => Number(t.id)) }) });
        router.refresh();
      } catch { setLocalTodo(null); }
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { once: true });
    document.addEventListener("pointercancel", onUp, { once: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };
  }, [dragId, view.todo, view.reportId, router]);

  // 헤더 '마감까지' 카운트다운 — 클라이언트에서만(하이드레이션 안전). 마감 기준 18:00 KST(결정 #8).
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
    const t = window.setInterval(() => setNowMs(Date.now()), 60000);
    return () => window.clearInterval(t);
  }, []);

  const openDrawer = (t: ReportTask, zone: string) =>
    setDrawer({ id: t.id, title: t.title, project: t.project, status: t.status, zone });

  function openEdit(t: ReportTask) {
    setEditing(t);
    setETitle(t.title);
    setEProject(t.project ?? "");
    setEDesc(t.description ?? "");
    setEStart(t.plannedStart ?? "");
    setEDur(DUR_OPTS.find(([, m]) => m === t.plannedDurationMin)?.[0] ?? "");
    setConfirmDel(false);
  }
  async function saveEdit() {
    if (!editing) return;
    if (!eTitle.trim()) {
      alert("업무명을 입력해 주세요.");
      return;
    }
    const durMin = DUR_OPTS.find(([l]) => l === eDur)?.[1] ?? null;
    const ok = await call(
      `/api/tasks/${editing.id}`,
      { edit: true, title: eTitle, project: eProject || null, description: eDesc.trim() || null, plannedStart: eStart || null, plannedDurationMin: durMin, ackReject: editing.rejectState === "반려" },
      "PATCH",
    );
    if (ok) {
      setEditing(null);
      flash("업무를 수정했어요");
      router.refresh();
    }
  }
  async function doDelete() {
    if (!editing) return;
    const ok = await call(`/api/tasks/${editing.id}`, { ackReject: editing.rejectState === "반려" }, "DELETE");
    if (ok) {
      setEditing(null);
      setConfirmDel(false);
      flash("업무를 삭제했어요");
      router.refresh();
    }
  }

  // ⋯ 메뉴 직접 삭제(편집 모달 거치지 않음)
  async function deleteTaskNow(t: ReportTask) {
    if (!window.confirm(`'${t.title}' 업무를 삭제할까요?`)) return;
    const ok = await call(`/api/tasks/${t.id}`, { ackReject: t.rejectState === "반려" }, "DELETE");
    if (ok) {
      flash("업무를 삭제했어요");
      router.refresh();
    }
  }

  const mode = view.mode;
  const readOnly = mode === "view" || view.status === "검수대기"; // 검수대기부터 제출본 잠금.
  const isWork = mode === "work" && !vacationMode;
  const submitted = mode === "view" || view.status === "검수대기"; // 스테퍼/배지: 제출됨 표시

  // 헤더 인디케이터: '마감까지 N'(작성 중일 때) + '저장됨 · 시각'
  let deadlineLabel: string | null = null;
  if (nowMs !== null && isWork && view.submitDueHm) {
    const kst = new Date(new Date(nowMs).toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const [dh, dm] = view.submitDueHm.split(":").map(Number);
    let remain = dh * 60 + dm - (kst.getHours() * 60 + kst.getMinutes());
    if (remain <= 0) remain += 24 * 60; // 이미 지난 시각이면 다음 마감(AI 익일 09:00 등)
    if (remain <= 18 * 60) { // 18시간 이내일 때만 임박 표시(윈도우 시작 직후 노이즈 방지)
      const h = Math.floor(remain / 60), m = remain % 60;
      deadlineLabel = h > 0 ? `마감까지 ${h}시간${m > 0 ? ` ${m}분` : ""}` : `마감까지 ${m}분`;
    }
  }
  // 클라이언트 마운트 후에만(nowMs!=null) 렌더 — 서버/클라 로케일 차이로 인한 하이드레이션 불일치(React #418) 방지
  const savedLabel = nowMs !== null && view.updatedAt
    ? `저장됨 · ${new Date(view.updatedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", hour12: true })}`
    : null;
  const doneCount = view.isAi
    ? view.aiDone.length
    : view.am.length + view.pm.length + view.night.filter((t) => t.status === "완결" || t.status === "지연").length;
  // 미수정 행 반려 수(반려 모드 재제출 경고용)
  const openRejects = [...view.todo, ...view.am, ...view.pm, ...view.night].filter((t) => t.rejectState === "반려").length;
  const primaryLabel = readOnly
    ? ""
    : vacationMode
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
        // 상태 변경됨(409) 또는 인증 만료(401)면 화면을 최신으로 동기화 — stale 반복클릭 방지
        if (res.status === 409) router.refresh();
        else if (res.status === 401) router.push("/login");
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
      description: desc.trim() || null,
      plannedStart: start || null,
      plannedDurationMin: durMin,
    });
    if (ok && ok.id) {
      // 첨부·링크(파일/URL) 업로드 — 생성된 업무에. 실패해도 업무는 남김.
      let failed = 0;
      for (const f of taskFiles) if (!(await uploadTaskFile(ok.id, f.file, f.note))) failed++;
      for (const u of taskUrls) if (u.url.trim() && !(await uploadTaskUrl(ok.id, u.url, u.note))) failed++;
      if (failed > 0) flash(`업무는 추가됐지만 첨부 ${failed}건 업로드에 실패했어요`);
      setTitle("");
      setProject("");
      setDesc("");
      setStart("");
      setDur("");
      setTaskFiles([]);
      setTaskUrls([]);
      if (taskFileRef.current) taskFileRef.current.value = "";
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

  // 미완료 업무 불러오기 — 팝업 열기(후보 전체 선택 기본)
  function openCarryPick() {
    setCarrySel(new Set(view.carryoverCandidates.map((c) => c.id)));
    setCarryPickOpen(true);
  }
  // 선택된 미완료 업무만 오늘 할 일로 추가
  async function loadCarryoverSelected() {
    const taskIds = [...carrySel];
    if (taskIds.length === 0) {
      setCarryPickOpen(false);
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/carryover`, { taskIds });
    if (ok) {
      flash(ok.count > 0 ? `미완료 ${ok.count}건을 불러왔어요` : "이미 모두 불러온 업무예요.");
      setCarryPickOpen(false);
      router.refresh();
    }
  }

  // ackReject: 현재 화면에 반려 밴드가 보이는(=직원이 반려를 본) 경우만 true. stale 화면이면 false→서버가 409로 새로고침 유도.
  async function markDone(taskId: number, ackReject: boolean) {
    const ok = await call(`/api/tasks/${taskId}/close`, { ackReject });
    if (ok) {
      flash("완료 시각으로 자동 분류했어요");
      router.refresh();
    }
  }

  async function reopen(taskId: number, ackReject: boolean) {
    const ok = await call(`/api/tasks/${taskId}/reopen`, { ackReject });
    if (ok) {
      flash("다시 할 일로 이동했어요");
      router.refresh();
    }
  }

  function resetCommForm() {
    setCommWho("");
    setCommTime("");
    setCommSummary("");
    setPendingFiles([]);
    setPendingUrls([]);
    if (commFileRef.current) commFileRef.current.value = "";
  }

  async function addComm() {
    if (!commWho.trim() || !commSummary.trim()) {
      alert("상대방과 내용 요약을 입력해 주세요.");
      return;
    }
    const ok = await call(`/api/reports/${view.reportId}/communications`, {
      type: commType,
      counterpart: commWho,
      time: commTime || null,
      summary: commSummary,
    });
    if (ok && ok.id) {
      // 첨부(파일/URL)를 순서대로 업로드. 실패해도 기록 자체는 남김.
      let failed = 0;
      for (const f of pendingFiles) {
        if (!(await uploadCommFile(ok.id, f.file, f.note))) failed++;
      }
      for (const u of pendingUrls) {
        if (u.url.trim() && !(await uploadCommUrl(ok.id, u.url, u.note))) failed++;
      }
      if (failed > 0) flash(`기록은 저장됐지만 첨부 ${failed}건 업로드에 실패했어요`);
      resetCommForm();
      setCommAddOpen(false);
      setNoComm(false);
      router.refresh();
    }
  }

  // 멀티파트 파일 업로드(call()은 JSON 전용이라 별도). 성공 시 true.
  async function uploadCommFile(commId: number, file: File, note: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (note.trim()) fd.append("comment", note.trim());
      const res = await fetch(`/api/communications/${commId}/attachments`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        if (res.status === 401) router.push("/login");
        return false;
      }
      return true;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  // URL(링크) 첨부 — JSON
  async function uploadCommUrl(commId: number, url: string, note: string): Promise<boolean> {
    const data = await call(`/api/communications/${commId}/attachments`, { url, comment: note || null });
    return !!data;
  }

  // 업무 첨부(파일/URL)
  async function uploadTaskFile(taskId: number, file: File, note: string): Promise<boolean> {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      if (note.trim()) fd.append("comment", note.trim());
      const res = await fetch(`/api/tasks/${taskId}/attachments`, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { if (res.status === 401) router.push("/login"); return false; }
      return true;
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }
  async function uploadTaskUrl(taskId: number, url: string, note: string): Promise<boolean> {
    const data = await call(`/api/tasks/${taskId}/attachments`, { url, comment: note || null });
    return !!data;
  }

  // 기존 기록에 '＋ 첨부파일·코멘트'
  // 자동 등록: 파일/URL 1건씩 즉시 업로드 후 새로고침(에디터는 열린 채로 추가 첨부 가능)
  async function commAttachFile(commId: number, file: File) {
    if (await uploadCommFile(commId, file, "")) { flash("첨부를 추가했어요"); router.refresh(); } else alert("첨부 업로드에 실패했습니다.");
  }
  async function commAttachUrl(commId: number, url: string) {
    if (await uploadCommUrl(commId, url, "")) { flash("링크를 추가했어요"); router.refresh(); } else alert("링크 추가에 실패했습니다.");
  }
  async function taskAttachFile(taskId: number, file: File) {
    if (await uploadTaskFile(taskId, file, "")) { flash("첨부를 추가했어요"); router.refresh(); } else alert("첨부 업로드에 실패했습니다.");
  }
  async function taskAttachUrl(taskId: number, url: string) {
    if (await uploadTaskUrl(taskId, url, "")) { flash("링크를 추가했어요"); router.refresh(); } else alert("링크 추가에 실패했습니다.");
  }

  async function deleteCommAttachment(attId: number) {
    const ok = await call(`/api/comm-attachments/${attId}`, {}, "DELETE");
    if (ok) {
      flash("첨부를 삭제했어요");
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
    // 반려 재제출: 안 고친 반려 경고는 모달(resubmit-open-rejects)에서 안내함.
    // 반려 재제출은 이월 무의미 → carryover 생략. 계획제출→최종 제출만 이월 적용.
    const wantCarry = mode !== "rejected" && carryOver;
    const ok = await call(`/api/reports/${view.reportId}/advance`, {
      nightBranch: nightOn ? "yes" : "no",
      nightReason: nightReason || null,
      dailyComment,
      carryover: wantCarry,
      expectedStatus: view.status,
    });
    setSubmitOpen(false);
    if (ok) {
      // 이월 결과를 정직하게 안내(차기 보고서 없으면 0 → 다음 작성 시 회수)
      if (wantCarry)
        flash(ok.carried > 0 ? `미완료 ${ok.carried}건을 다음 보고서로 이월했어요` : "다음 보고서가 아직 없어요 — 다음 작성 시 ‘어제 미완료 불러오기’로 가져올 수 있어요", 3200);
      router.refresh();
    }
  }

  const incompleteN = view.todo.length;

  return (
    <div data-report-id={view.reportId} data-report-mode={mode}>
      {/* 페이지 헤더 — 한 줄. 좌측: 제목·날짜·마감·저장 / 우측: 야간 업무 토글·근태 변경. 스크롤 시 상단 고정(sticky) */}
      <div data-testid="report-header" style={{ position: "sticky", top: 56, zIndex: 40, background: "#fff", borderBottom: "1px solid #E2E5EB" }}>
        <div style={{ padding: "12px 24px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 17, fontWeight: 700 }}>일일 업무 보고서</span>
          <span style={{ fontSize: 14, color: "#3A4150", fontWeight: 600 }} className="tnum">{view.dateLabel}</span>
          {deadlineLabel && (
            <span data-testid="deadline-pill" style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#B45309", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 9999, padding: "4px 11px" }}>⏰ {deadlineLabel}</span>
          )}
          {savedLabel && (
            <span data-testid="saved-indicator" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "#6B7280" }} className="tnum"><span style={{ color: "#1F9254" }}>✓</span>{savedLabel}</span>
          )}
          <span data-testid="report-status" className="badge" style={{ color: statusMeta(view.status).main, background: statusMeta(view.status).bg, border: `1px solid ${statusMeta(view.status).line}` }}>
            {view.status}
          </span>
          <div style={{ flex: 1, minWidth: 8 }} />
          {isWork && view.isAi && (
            <button onClick={() => setVacationMode(true)} data-testid="go-vacation" style={{ ...btnGhost, fontSize: 12, padding: "6px 12px" }}>근태 변경</button>
          )}
          {isWork && !view.isAi && (
            <>
              <span style={{ fontSize: 13, fontWeight: 600 }}>야간 업무</span>
              {nightOn && !nightReason.trim() && <span style={{ fontSize: 11, fontWeight: 600, color: "#DC2626" }}>사유 필요</span>}
              <div style={{ display: "inline-flex", background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 9999, padding: 3 }}>
                <button onClick={() => setNight(false)} data-testid="night-off" style={pill(!nightOn)}>없음</button>
                <button onClick={() => setNight(true)} data-testid="night-on" style={pill(nightOn)}>있음</button>
              </div>
              <button onClick={() => setVacationMode(true)} data-testid="go-vacation" style={{ ...btnGhost, fontSize: 12, padding: "6px 12px" }}>근태 변경</button>
            </>
          )}
        </div>
      </div>

      <div style={{ maxWidth: 808, margin: "0 auto", padding: "24px 24px 120px" }}>
        {(() => {
          const rejectComment = view.events.findLast((e) => e.kind === "rejected" || e.kind === "plan_rejected")?.comment;
          let banner: { icon: string; title: string; sub: string; bg: string; line: string; fg: string } | null = null;
          if (mode === "rejected")
            banner = { icon: "↩", title: "그룹장이 보고서를 반려했습니다.", sub: rejectComment ? `그룹장 코멘트: ${rejectComment}` : "반려된 업무만 수정·재마감한 뒤 다시 제출해 주세요.", bg: "#FCEBEB", line: "#F5C2C2", fg: "#B91C1C" };
          else if (view.status === "검수대기")
            banner = { icon: "⧗", title: "검수 대기 중입니다.", sub: "제출된 보고서는 읽기 전용입니다. 수정이 필요하면 검수자에게 반려를 요청해 주세요.", bg: "#FBF4DA", line: "#EFE0A6", fg: "#8A6508" };
          else if (mode === "view")
            banner = { icon: "✓", title: view.status === "승인" ? "승인 완료된 보고서입니다." : "제출 완료된 보고서입니다.", sub: "최종 처리되어 읽기 전용입니다. 수정이 필요하면 검수자에게 반려를 요청해 주세요.", bg: "#E7F6EC", line: "#BBE5C8", fg: "#1F7A46" };
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

        {/* 휴가 모드 (F2) */}
        {vacationMode ? (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: 22, marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }} data-testid="vacation-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{readOnly ? "휴가 보고가 제출되었습니다." : "오늘은 휴가로 처리할까요?"}</div>
              {!readOnly && (
                <button onClick={() => setVacationMode(false)} data-testid="exit-vacation" style={btnGhost}>← 업무 작성으로</button>
              )}
            </div>
            <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 16 }}>{readOnly ? "검수 대기 상태라 읽기 전용입니다." : "휴가 유형과 사유만 입력하면 됩니다."}</div>

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
            {/* 오늘 할 일 (work 모드) + 반려 모드 */}
            {(isWork || mode === "rejected") && (
              <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderLeft: `3px solid ${mode === "rejected" ? "#DC2626" : "#3B5BDB"}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: mode === "rejected" ? "#B91C1C" : "#3B5BDB", background: mode === "rejected" ? "#FCEBEB" : "#EEF2FF", padding: "3px 9px", borderRadius: 9999 }}>{mode === "rejected" ? "보고서 수정" : "오늘 할 일"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#6B7280" }}>할 일 {view.todo.length} · 진행중 {view.todo.filter((t) => t.status === "진행중").length}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, lineHeight: "26px", marginTop: 10 }}>{mode === "rejected" ? "반려된 보고서를 수정해 주세요" : WORK_HEADER.title}</div>
                <div style={{ fontSize: 13, lineHeight: "20px", color: "#6B7280", marginTop: 3 }}>{mode === "rejected" ? "반려 사유를 확인하고 업무를 수정·추가·재마감한 뒤 ‘다시 제출’해 주세요." : WORK_HEADER.sub}</div>

                {/* 미완료 리스트 */}
                <div style={{ marginTop: 8 }}>
                  {todoRows.map((t) => (
                    <TaskRow key={t.id} t={t} busy={busy} projCust={projCust}reorderable={todoRows.length > 1} dragging={dragId === String(t.id)} onDragStart={(e) => startDrag(t.id, e)} onMarkDone={() => markDone(t.id, t.rejectState === "반려")} onComment={() => openDrawer(t, "오늘 할 일")} onMenu={() => openEdit(t)} onDelete={() => deleteTaskNow(t)} attach={{ open: attachOpen?.kind === "task" && attachOpen.id === t.id, onToggle: () => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === t.id ? null : { kind: "task", id: t.id }), onUploadFile: (f) => taskAttachFile(t.id, f), onUploadUrl: (u) => taskAttachUrl(t.id, u) }} />
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
                    {mode === "work" && (
                      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                        <button onClick={openCarryPick} disabled={busy} data-testid="carryover" style={view.carryoverCandidates.length > 0 ? { ...chip, color: "#DC2626", borderColor: "#F5C2C2", background: "#FCEBEB", fontWeight: 700 } : chip}>↻ 미완료 업무 불러오기{view.carryoverCandidates.length > 0 ? ` (${view.carryoverCandidates.length})` : ""}</button>
                        {view.recentTasks.length > 0 && (
                          <button onClick={() => { setAddOpen(true); setSuggestOpen(true); }} data-testid="repeat-task" style={chip}>반복 업무</button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ border: "1px solid #CBD0D9", borderRadius: 10, background: "#FBFCFD", padding: 14, marginTop: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>업무 추가</div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>프로젝트 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                    {/* 관리에서 등록한 보관 제외 프로젝트 제안(드롭다운) + 자유 텍스트 입력 병행(B2) */}
                    {view.projectOptions.length > 0 && (
                      <select value={view.projectOptions.some((p) => p.name === project) ? project : ""} onChange={(e) => { setProject(e.target.value); setSuggestOpen(true); }} data-testid="add-project-select" style={{ ...inp, padding: "0 10px", color: "#3A4150", background: "#fff", cursor: "pointer", marginBottom: 8 }}>
                        <option value="">프로젝트 선택</option>
                        {view.projectOptions.map((p) => <option key={p.name} value={p.name}>{p.custName ? `${p.name} · ${p.custName}` : p.name}</option>)}
                      </select>
                    )}
                    <input value={project} onChange={(e) => { setProject(e.target.value); setSuggestOpen(true); }} onFocus={() => setSuggestOpen(true)} data-testid="add-project" placeholder={view.projectOptions.length > 0 ? "또는 프로젝트명 직접 입력 (최근 업무 불러오기)" : "프로젝트명을 입력하면 최근 업무를 불러올 수 있어요"} style={inp} />
                    {filteredRecent.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }} data-testid="recent-chips">
                        {filteredRecent.map((s, i) => (
                          <button key={i} onClick={() => pickRecent(s.name, s.project)} data-testid="recent-item" title={`${s.name}${s.project ? ` · ${s.project}` : ""}`} style={{ border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150", borderRadius: 9999, padding: "5px 12px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.project || s.name}</button>
                        ))}
                      </div>
                    )}
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>업무명 <span style={{ color: "#DC2626" }}>*</span></label>
                    <input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="add-title" placeholder="업무명을 입력해 주세요" style={inp} />
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>업무 설명 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                    <textarea value={desc} onChange={(e) => setDesc(e.target.value.slice(0, 5000))} data-testid="add-desc" placeholder="업무 내용, 진행 방식, 참고사항 등을 자유롭게 적어주세요" style={{ display: "block", width: "100%", height: 240, border: "1px solid #CBD0D9", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, lineHeight: "20px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
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
                    {/* 첨부 · 링크 (선택) — 디자인 v23 */}
                    <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#3A4150" }}>첨부 · 링크 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></span>
                      <div style={{ flex: 1, minWidth: 4 }} />
                      <label data-testid="task-file-pick" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 11l4-4a2.5 2.5 0 0 1 3.5 3.5l-5 5a4 4 0 0 1-5.6-5.6l5-5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        파일 첨부
                        <input ref={taskFileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setTaskFiles((s) => [...s, { file: f, note: "" }]); if (taskFileRef.current) taskFileRef.current.value = ""; }} />
                      </label>
                      <button onClick={() => setTaskUrls((s) => [...s, { url: "", note: "" }])} data-testid="task-url-add" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1-1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        URL 추가
                      </button>
                    </div>
                    {taskFiles.map((pf, i) => (
                      <div key={`tf${i}`} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} data-testid="task-pending-file">
                        <div className="attach-row" style={{ flex: 1, minWidth: 0, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", padding: "0 10px", display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#3A4150", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 }} data-testid="task-file-name">📎 {pf.file.name}</span>
                          <input value={pf.note} onChange={(e) => setTaskFiles((s) => s.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="설명 (선택)" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, color: "#6B7280", outline: "none", background: "transparent" }} />
                        </div>
                        <button onClick={() => setTaskFiles((s) => s.filter((_, j) => j !== i))} title="제거" style={{ flex: "none", width: 36, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", color: "#9AA1AE", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    {taskUrls.map((pu, i) => (
                      <div key={`tu${i}`} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} data-testid="task-pending-url">
                        <div className="attach-row" style={{ flex: 1, minWidth: 0, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", padding: "0 10px", display: "flex", gap: 8, alignItems: "center" }}>
                          <input value={pu.url} onChange={(e) => setTaskUrls((s) => s.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" data-testid="task-url-input" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, outline: "none", background: "transparent" }} />
                          <span style={{ width: 1, height: 18, background: "#E2E5EB", flex: "none" }} />
                          <input value={pu.note} onChange={(e) => setTaskUrls((s) => s.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="설명 (선택)" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, color: "#6B7280", outline: "none", background: "transparent" }} />
                        </div>
                        <button onClick={() => setTaskUrls((s) => s.filter((_, j) => j !== i))} title="제거" style={{ flex: "none", width: 36, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", color: "#9AA1AE", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                      <button onClick={() => { setAddOpen(false); setSuggestOpen(false); setDesc(""); setTaskFiles([]); setTaskUrls([]); }} data-testid="add-cancel" style={btnGhost}>취소</button>
                      <button onClick={submitAdd} disabled={busy} data-testid="add-submit" style={btnPrimary}>추가</button>
                    </div>
                  </div>
                )}

                {/* 야간 업무 사유 — 토글은 헤더로 이동. '있음'일 때 사유 입력 */}
                {nightOn && (
                  <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid #EFF1F5" }}>
                    <label style={{ display: "flex", alignItems: "baseline", gap: 6, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>🌙 야간 업무 사유 <span style={{ color: "#DC2626" }}>*</span></label>
                    <textarea value={nightReason} onChange={(e) => setNightReason(e.target.value)} data-testid="night-reason" placeholder="예) PG사 정기 점검 대응으로 21:30까지 야간 대기가 필요합니다." style={{ width: "100%", minHeight: 72, border: "1px solid #CBD0D9", borderRadius: 8, padding: 12, fontFamily: "inherit", fontSize: 14, resize: "vertical", outline: "none" }} />
                  </div>
                )}
              </div>
            )}

            {/* 제출 후 읽기 전용: 미완료(할 일) 행도 보이게. 반려 모드는 위 편집 카드에서 처리 */}
            {readOnly && view.todo.length > 0 && (
              <div data-testid="todo-readonly" style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>미완료 · 진행 중</span>
                  <div style={{ flex: 1 }} />
                  <span className="badge" style={{ color: "#3A4150", background: "#F1F2F4", border: "1px solid #D9DCE2" }}>{view.todo.length}건</span>
                </div>
                <div style={{ padding: "6px 18px 14px" }}>
                  {view.todo.map((t) => (
                    <TaskRow key={t.id} t={t} busy={busy} projCust={projCust}editable={!readOnly} rejectedMode={false} onMarkDone={() => markDone(t.id, t.rejectState === "반려")} onComment={() => openDrawer(t, "오늘 할 일")} onMenu={() => openEdit(t)} onDelete={() => deleteTaskNow(t)} attach={readOnly ? undefined : { open: attachOpen?.kind === "task" && attachOpen.id === t.id, onToggle: () => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === t.id ? null : { kind: "task", id: t.id }), onUploadFile: (f) => taskAttachFile(t.id, f), onUploadUrl: (u) => taskAttachUrl(t.id, u) }} />
                  ))}
                </div>
              </div>
            )}

            {/* 결과 바구니: AI 그룹은 24시간 단일 타임라인, 그 외는 오전 / 오후 / 야간 */}
            {view.isAi ? (
              <ResultBucket testid="result-bucket-ai" zone="완료" icon="" name="완료" range="24시간 (완료시각 순)" tasks={view.aiDone} editable={!readOnly} rejectedMode={false} busy={busy} projCust={projCust} onReopen={reopen}onComment={openDrawer} onMenu={openEdit} onDelete={deleteTaskNow} attachOpenId={attachOpen?.kind === "task" ? attachOpen.id : null} onAttachToggle={(id) => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === id ? null : { kind: "task", id })} onAttachUploadFile={taskAttachFile} onAttachUploadUrl={taskAttachUrl} emptyText="아직 완료한 업무가 없습니다." />
            ) : (
              <>
                <ResultBucket testid="result-bucket-am" zone="오전" icon="" name="오전" range="00:00 ~ 11:59" tasks={view.am} editable={!readOnly} rejectedMode={false} busy={busy} projCust={projCust} onReopen={reopen}onComment={openDrawer} onMenu={openEdit} onDelete={deleteTaskNow} attachOpenId={attachOpen?.kind === "task" ? attachOpen.id : null} onAttachToggle={(id) => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === id ? null : { kind: "task", id })} onAttachUploadFile={taskAttachFile} onAttachUploadUrl={taskAttachUrl} emptyText="아직 오전에 마감한 업무가 없습니다." />
                <ResultBucket testid="result-bucket-pm" zone="오후" icon="" name="오후" range="12:00 ~" tasks={view.pm} editable={!readOnly} rejectedMode={false} busy={busy} projCust={projCust} onReopen={reopen}onComment={openDrawer} onMenu={openEdit} onDelete={deleteTaskNow} attachOpenId={attachOpen?.kind === "task" ? attachOpen.id : null} onAttachToggle={(id) => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === id ? null : { kind: "task", id })} onAttachUploadFile={taskAttachFile} onAttachUploadUrl={taskAttachUrl} emptyText="아직 오후에 마감한 업무가 없습니다." />
                {(nightOn || view.night.length > 0) && (
                  <ResultBucket testid="result-bucket-night" zone="야간" icon="🌙 " name="야간" range="20:00 ~" tasks={view.night} editable={!readOnly} rejectedMode={false} busy={busy} projCust={projCust} onReopen={reopen}onComment={openDrawer} onMenu={openEdit} onDelete={deleteTaskNow} attachOpenId={attachOpen?.kind === "task" ? attachOpen.id : null} onAttachToggle={(id) => setAttachOpen(attachOpen?.kind === "task" && attachOpen.id === id ? null : { kind: "task", id })} onAttachUploadFile={taskAttachFile} onAttachUploadUrl={taskAttachUrl} emptyText="마감한 야간 업무가 정리됩니다." />
                )}
              </>
            )}
          </>
        )}

        {/* 커뮤니케이션 기록 — v23 디자인 충실 */}
        {!vacationMode && (
          <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, padding: "16px 18px", marginBottom: 16, boxShadow: "0 1px 3px rgba(16,24,40,.08)" }} data-testid="comm-section">
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>커뮤니케이션 기록</div>
            {view.comms.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 0", borderBottom: "1px solid #F2F3F6" }} data-testid="comm-row">
                <span className="badge badge-comm" style={{ flex: "none" }}>{c.type}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#1A1F2B" }}><strong style={{ fontWeight: 600 }}>{c.counterpart}</strong>{c.time ? <> · <span className="tnum" style={{ color: "#6B7280" }}>{c.time}</span></> : null}</div>
                  <div style={{ fontSize: 13, color: "#3A4150", marginTop: 2 }}>{c.summary}</div>
                  {c.attachments.map((a) => {
                    const isUrl = !!a.url;
                    const label = isUrl ? a.url! : (a.fileName ?? "첨부");
                    return (
                    <div key={a.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 7, padding: "4px 9px", marginTop: 6, marginRight: 6, maxWidth: "100%" }} data-testid="comm-att-chip">
                      <a href={isUrl ? a.url! : `/api/comm-attachments/${a.id}`} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noreferrer" : undefined} title={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", minWidth: 0 }}>
                        <span style={{ color: "#6B7280" }}>{isUrl ? "🔗" : "📎"}</span>
                        <span style={{ fontSize: 12, color: "#3A4150", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
                        {a.comment ? <span style={{ fontSize: 11, color: "#9AA1AE", whiteSpace: "nowrap" }}>· {a.comment}</span> : null}
                      </a>
                      {!readOnly && <button onClick={() => deleteCommAttachment(a.id)} disabled={busy} title="첨부 삭제" data-testid="comm-att-del" style={{ flex: "none", marginLeft: 2, width: 16, height: 16, lineHeight: "14px", borderRadius: 9999, border: "none", background: "#EDEFF3", color: "#6B7280", fontSize: 11, cursor: "pointer", padding: 0 }}>✕</button>}
                    </div>
                    );
                  })}
                  {!readOnly && (attachOpen?.kind === "comm" && attachOpen.id === c.id ? (
                    <AttachLinkEditor busy={busy} onUploadFile={(f) => commAttachFile(c.id, f)} onUploadUrl={(u) => commAttachUrl(c.id, u)} />
                  ) : (
                    <div style={{ marginTop: 6 }}>
                      <button onClick={() => setAttachOpen(attachOpen?.kind === "comm" && attachOpen.id === c.id ? null : { kind: "comm", id: c.id })} data-testid="comm-att-add" style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3B5BDB", padding: 0 }}>＋ 첨부파일·코멘트 (선택)</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!readOnly && (
              <>
                {!commAddOpen ? (
                  <button onClick={() => setCommAddOpen(true)} data-testid="comm-add-open" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: "none", border: "1px dashed #CBD0D9", borderRadius: 8, padding: "9px 12px", width: "100%", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3B5BDB", marginTop: 12 }}>＋ 커뮤니케이션 기록 추가</button>
                ) : (
                  <div style={{ border: "1px solid #CBD0D9", borderRadius: 10, background: "#FBFCFD", padding: 14, marginTop: 12 }} data-testid="comm-add-form">
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>커뮤니케이션 기록 추가</div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>유형 <span style={{ color: "#DC2626" }}>*</span></label>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }} data-testid="comm-type-chips">
                      {COMM_TYPES.map((t) => {
                        const on = commType === t;
                        return <button key={t} onClick={() => setCommType(t)} aria-pressed={on} style={{ border: `1px solid ${on ? "#3B5BDB" : "#CBD0D9"}`, background: on ? "#3B5BDB" : "#fff", color: on ? "#fff" : "#3A4150", borderRadius: 9999, padding: "5px 13px", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600 }}>{t}</button>;
                      })}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <div style={{ flex: 2, minWidth: 170 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>상대방 <span style={{ color: "#DC2626" }}>*</span></label>
                        <input value={commWho} onChange={(e) => setCommWho(e.target.value)} placeholder="상대방 (이름·부서·회사)" data-testid="comm-who" style={inp} />
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>시각 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                        <input value={commTime} onChange={(e) => setCommTime(e.target.value)} placeholder="예) 14:30" className="tnum" data-testid="comm-time" style={inp} />
                      </div>
                    </div>
                    <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>내용 요약 <span style={{ color: "#DC2626" }}>*</span></label>
                    <input value={commSummary} onChange={(e) => setCommSummary(e.target.value)} placeholder="어떤 내용이었는지 한 줄로 적어주세요" data-testid="comm-summary" style={inp} />
                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#3A4150" }}>첨부 · 링크 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></span>
                      <div style={{ flex: 1, minWidth: 4 }} />
                      <label data-testid="comm-file-pick" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 11l4-4a2.5 2.5 0 0 1 3.5 3.5l-5 5a4 4 0 0 1-5.6-5.6l5-5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        파일 첨부
                        <input ref={commFileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) setPendingFiles((s) => [...s, { file: f, note: "" }]); if (commFileRef.current) commFileRef.current.value = ""; }} />
                      </label>
                      <button onClick={() => setPendingUrls((s) => [...s, { url: "", note: "" }])} data-testid="comm-url-add" style={{ display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                        <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1-1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        URL 추가
                      </button>
                    </div>
                    {pendingFiles.map((pf, i) => (
                      <div key={`f${i}`} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} data-testid="pending-file">
                        <div className="attach-row" style={{ flex: 1, minWidth: 0, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", padding: "0 10px", display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#3A4150", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }} data-testid="comm-file-name">📎 {pf.file.name}</span>
                          <input value={pf.note} onChange={(e) => setPendingFiles((s) => s.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="설명 (선택)" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, color: "#6B7280", outline: "none", background: "transparent" }} />
                        </div>
                        <button onClick={() => setPendingFiles((s) => s.filter((_, j) => j !== i))} title="제거" style={{ flex: "none", width: 36, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", color: "#9AA1AE", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    {pendingUrls.map((pu, i) => (
                      <div key={`u${i}`} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} data-testid="pending-url">
                        <div className="attach-row" style={{ flex: 1, minWidth: 0, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", padding: "0 10px", display: "flex", gap: 8, alignItems: "center" }}>
                          <input value={pu.url} onChange={(e) => setPendingUrls((s) => s.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="https://" data-testid="comm-url-input" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, outline: "none", background: "transparent" }} />
                          <span style={{ width: 1, height: 18, background: "#E2E5EB", flex: "none" }} />
                          <input value={pu.note} onChange={(e) => setPendingUrls((s) => s.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} placeholder="설명 (선택)" style={{ flex: 1, minWidth: 0, height: 34, border: "none", padding: "0 2px", fontFamily: "inherit", fontSize: 13, color: "#6B7280", outline: "none", background: "transparent" }} />
                        </div>
                        <button onClick={() => setPendingUrls((s) => s.filter((_, j) => j !== i))} title="제거" style={{ flex: "none", width: 36, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", color: "#9AA1AE", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>✕</button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
                      <button onClick={() => { setCommAddOpen(false); resetCommForm(); }} style={{ height: 38, padding: "0 16px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>취소</button>
                      <button onClick={addComm} disabled={busy || !commWho.trim() || !commSummary.trim()} data-testid="comm-add" style={{ height: 38, padding: "0 18px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: (commWho.trim() && commSummary.trim()) ? 1 : 0.5 }}>추가</button>
                    </div>
                  </div>
                )}
                <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, cursor: "pointer" }}>
                  <input type="checkbox" checked={noComm} onChange={toggleNoComm} data-testid="no-comm" />
                  <span style={{ fontSize: 13, color: "#3A4150" }}>오늘 커뮤니케이션 없음</span>
                </label>
              </>
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
              <div style={{ fontSize: 17, fontWeight: 700 }}>{mode === "rejected" ? "수정한 보고서를 다시 제출할까요?" : "오늘 보고를 제출할까요?"}</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>{mode === "rejected" ? "다시 제출하면 검수 대기 상태로 바뀌고, 보고서는 수정할 수 없게 잠깁니다." : "제출하면 검수 대기 상태가 되고, 보고서는 읽기 전용으로 잠깁니다."}</div>
            </div>
            <div style={{ padding: "16px 22px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 10, padding: "12px 14px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#1A1F2B" }}>완료 {doneCount} · 남은 {incompleteN}</span>
              </div>
              {/* 반려 재제출: 안 고친 반려 행이 남아있으면 경고(이월 토글은 의미 없어 숨김) */}
              {mode === "rejected" && openRejects > 0 && (
                <div data-testid="resubmit-open-rejects" style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FCEBEB", border: "1px solid #F5C2C2", borderRadius: 10, padding: "11px 14px", marginTop: 10 }}>
                  <span style={{ color: "#DC2626" }}>↩</span>
                  <div style={{ fontSize: 13, color: "#B91C1C", lineHeight: "19px" }}>아직 수정하지 않은 반려 업무가 {openRejects}건 있습니다. 확인 후 그대로 다시 제출할 수 있어요.</div>
                </div>
              )}
              {incompleteN > 0 && mode !== "rejected" && (
                <>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 10, padding: "11px 14px", marginTop: 10 }}>
                    <span style={{ color: "#D97706" }}>⚠</span>
                    <div style={{ fontSize: 13, color: "#B45309", lineHeight: "19px" }}>미완료 {incompleteN}건이 있습니다. 이대로 제출하면 미완 상태로 보고됩니다.</div>
                  </div>
                  <button onClick={() => setCarryOver((v) => !v)} data-testid="carry-toggle" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: carryOver ? "#EEF2FF" : "#fff", border: `1px solid ${carryOver ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 10, padding: "11px 14px", marginTop: 8, cursor: "pointer", fontFamily: "inherit" }}>
                    <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: carryOver ? "#3B5BDB" : "#fff", border: `1.5px solid ${carryOver ? "#3B5BDB" : "#CBD0D9"}`, color: "#fff", fontSize: 12, fontWeight: 700 }}>{carryOver ? "✓" : ""}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#3A4150" }}>미완료 {incompleteN}건을 <span style={{ color: "#3B5BDB" }}>다음 보고서로 이월</span> <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(없으면 다음 작성 시 반영)</span></span>
                  </button>
                </>
              )}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
                <button onClick={() => setSubmitOpen(false)} style={btnGhost}>취소</button>
                <button onClick={confirmSubmit} disabled={busy} data-testid="submit-confirm" style={btnPrimary}>{mode === "rejected" ? "다시 제출" : "제출하기"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 미완료 업무 불러오기 — 후보 선택 팝업 */}
      {carryPickOpen && (
        <div onClick={() => setCarryPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 225, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="carry-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 460, display: "flex", flexDirection: "column", maxHeight: "82vh" }}>
            <div style={{ padding: "20px 22px 0" }}>
              <div style={{ fontSize: 17, fontWeight: 700 }}>미완료 업무 불러오기</div>
              <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>직전 보고서에서 아직 끝내지 못한 업무예요. 오늘 가져올 업무를 선택하세요.</div>
            </div>
            <div style={{ padding: "14px 22px 0", overflowY: "auto" }}>
              {view.carryoverCandidates.length === 0 ? (
                <div style={{ border: "1px dashed #E2E5EB", borderRadius: 10, padding: 20, textAlign: "center", fontSize: 13, color: "#9AA1AE" }}>불러올 미완료 업무가 없습니다.</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <button
                      onClick={() => setCarrySel((s) => (s.size === view.carryoverCandidates.length ? new Set() : new Set(view.carryoverCandidates.map((c) => c.id))))}
                      data-testid="carry-select-all"
                      style={{ ...chip, fontSize: 11 }}
                    >
                      {carrySel.size === view.carryoverCandidates.length ? "전체 해제" : "전체 선택"}
                    </button>
                    <span style={{ fontSize: 12, color: "#9AA1AE", fontWeight: 600 }}>{carrySel.size} / {view.carryoverCandidates.length} 선택</span>
                  </div>
                  {view.carryoverCandidates.map((c) => {
                    const on = carrySel.has(c.id);
                    return (
                      <button
                        key={c.id}
                        onClick={() => setCarrySel((s) => { const n = new Set(s); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                        data-testid="carry-candidate"
                        data-task-id={c.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", background: on ? "#EEF2FF" : "#fff", border: `1px solid ${on ? "#3B5BDB" : "#E2E5EB"}`, borderRadius: 10, padding: "11px 14px", marginBottom: 8, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        <span style={{ width: 20, height: 20, borderRadius: 6, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", background: on ? "#3B5BDB" : "#fff", border: `1.5px solid ${on ? "#3B5BDB" : "#CBD0D9"}`, color: "#fff", fontSize: 12, fontWeight: 700 }}>{on ? "✓" : ""}</span>
                        <span style={{ minWidth: 0, flex: 1 }}>
                          {c.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px", marginRight: 6 }}>{c.project}</span>}
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1A1F2B" }}>{c.title}</span>
                        </span>
                      </button>
                    );
                  })}
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", padding: "14px 22px 18px" }}>
              <button onClick={() => setCarryPickOpen(false)} style={btnGhost}>취소</button>
              <button onClick={loadCarryoverSelected} disabled={busy || carrySel.size === 0} data-testid="carry-confirm" style={{ ...btnPrimary, opacity: carrySel.size === 0 ? 0.5 : 1 }}>추가 ({carrySel.size})</button>
            </div>
          </div>
        </div>
      )}

      {/* 업무 수정/삭제 모달 (⋯) */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, zIndex: 230, background: "rgba(16,24,40,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} data-testid="edit-modal" style={{ background: "#fff", borderRadius: 16, boxShadow: "0 12px 28px rgba(16,24,40,.16)", width: "100%", maxWidth: 460 }}>
            {confirmDel ? (
              <div style={{ padding: "22px" }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>이 업무를 삭제할까요?</div>
                <div style={{ fontSize: 13, color: "#6B7280", marginTop: 6 }}>‘{editing.title}’ — 되돌릴 수 없습니다. 댓글·첨부도 함께 삭제됩니다.</div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
                  <button onClick={() => setConfirmDel(false)} style={btnGhost}>취소</button>
                  <button onClick={doDelete} disabled={busy} data-testid="delete-confirm" style={{ ...btnPrimary, background: "#DC2626" }}>삭제</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 22px", borderBottom: "1px solid #EFF1F5" }}>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>업무 수정</span>
                  <button onClick={() => setEditing(null)} aria-label="닫기" style={{ background: "none", border: "none", cursor: "pointer", color: "#9AA1AE", fontSize: 20 }}>✕</button>
                </div>
                <div style={{ padding: "18px 22px" }}>
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>업무명 <span style={{ color: "#DC2626" }}>*</span></label>
                  <input value={eTitle} onChange={(e) => setETitle(e.target.value)} data-testid="edit-title" style={inp} />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>프로젝트명 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                  <input value={eProject} onChange={(e) => setEProject(e.target.value)} data-testid="edit-project" style={inp} />
                  <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", margin: "14px 0 6px" }}>업무 설명 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                  <textarea value={eDesc} onChange={(e) => setEDesc(e.target.value.slice(0, 5000))} data-testid="edit-desc" placeholder="업무 내용, 진행 방식, 참고사항 등을 자유롭게 적어주세요" style={{ display: "block", width: "100%", height: 120, border: "1px solid #CBD0D9", borderRadius: 8, padding: "10px 12px", fontFamily: "inherit", fontSize: 14, lineHeight: "20px", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>예정 시간 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                      <select value={eStart} onChange={(e) => setEStart(e.target.value)} style={{ ...inp, padding: "0 10px" }}>
                        <option value="">시작 시각</option>
                        {TIME_OPTS.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1, minWidth: 130 }}>
                      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#3A4150", marginBottom: 6 }}>소요 시간 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></label>
                      <select value={eDur} onChange={(e) => setEDur(e.target.value)} style={{ ...inp, padding: "0 10px" }}>
                        <option value="">소요 시간</option>
                        {DUR_OPTS.map(([l]) => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", padding: "14px 22px", borderTop: "1px solid #EFF1F5" }}>
                  <button onClick={() => setConfirmDel(true)} data-testid="edit-delete" style={{ background: "none", border: "none", color: "#DC2626", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>삭제</button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => setEditing(null)} style={{ ...btnGhost, marginRight: 8 }}>취소</button>
                  <button onClick={saveEdit} disabled={busy} data-testid="edit-save" style={btnPrimary}>저장</button>
                </div>
              </>
            )}
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
            {vacationMode && (
              <button onClick={() => setVacationMode(false)} disabled={busy} data-testid="vacation-cancel" style={{ height: 44, padding: "0 18px", border: "1px solid #CBD0D9", borderRadius: 8, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>취소</button>
            )}
            {primaryLabel && (
              <button onClick={onPrimary} disabled={busy} data-testid="primary-action" style={{ height: 44, padding: "0 22px", border: "none", borderRadius: 8, background: "#3B5BDB", color: "#fff", fontFamily: "inherit", fontSize: 14, fontWeight: 600, cursor: busy ? "wait" : "pointer" }}>{primaryLabel}</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MenuButton({ onEdit, onClose, onDelete, closeLabel }: { onEdit: () => void; onClose: () => void; onDelete: () => void; closeLabel: string }) {
  const [open, setOpen] = useState(false);
  const item: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", padding: "8px 12px", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#3A4150", whiteSpace: "nowrap" };
  return (
    <div style={{ position: "relative", flex: "none", marginTop: 1 }}>
      <button onClick={() => setOpen((o) => !o)} data-testid="task-menu" aria-label="업무 메뉴" aria-haspopup="menu" aria-expanded={open} style={{ background: open ? "#F1F2F4" : "none", border: "none", borderRadius: 7, cursor: "pointer", color: "#9AA1AE", fontSize: 18, lineHeight: 1, padding: "2px 6px" }}>⋯</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 120 }} />
          <div role="menu" data-testid="task-menu-popover" style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 130, background: "#fff", border: "1px solid #E2E5EB", borderRadius: 10, boxShadow: "0 8px 24px rgba(16,24,40,.14)", padding: 4, minWidth: 132 }}>
            <button role="menuitem" onClick={() => { setOpen(false); onEdit(); }} data-testid="menu-edit" style={item}>✎ 수정</button>
            <button role="menuitem" onClick={() => { setOpen(false); onClose(); }} data-testid="menu-close" style={item}>✓ {closeLabel}</button>
            <button role="menuitem" onClick={() => { setOpen(false); onDelete(); }} data-testid="menu-delete" style={{ ...item, color: "#DC2626" }}>🗑 삭제</button>
          </div>
        </>
      )}
    </div>
  );
}

function TaskAttachChips({ atts }: { atts: TaskAttachment[] }) {
  if (!atts || atts.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }} data-testid="task-attachments">
      {atts.map((a) => {
        const isUrl = a.kind === "url";
        const label = isUrl ? (a.url ?? "링크") : (a.fileName ?? "첨부");
        return (
          <a key={a.id} href={isUrl ? (a.url ?? "#") : `/api/attachments/${a.id}`} target={isUrl ? "_blank" : undefined} rel={isUrl ? "noreferrer" : undefined} title={label} data-testid="task-att-chip" style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#F7F8FA", border: "1px solid #E2E5EB", borderRadius: 7, padding: "3px 8px", textDecoration: "none", color: "#3A4150", fontSize: 12, fontWeight: 600, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isUrl ? "🔗" : "📎"} {label}{a.comment ? <span style={{ color: "#9AA1AE", fontWeight: 400 }}>&nbsp;· {a.comment}</span> : null}
          </a>
        );
      })}
    </div>
  );
}

// 통일된 첨부·링크 인라인 에디터(업무 행 / 커뮤니케이션 행 공통).
// 자동 등록: 파일 선택 즉시 업로드 / URL은 Enter(또는 입력칸 이탈) 시 업로드. 취소·첨부 버튼 없음.
function AttachLinkEditor({ busy, onUploadFile, onUploadUrl }: { busy: boolean; onUploadFile: (file: File) => void; onUploadUrl: (url: string) => void }) {
  const [urls, setUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const send = (i: number) => {
    const u = (urls[i] ?? "").trim();
    if (!/^https?:\/\//i.test(u)) return;
    onUploadUrl(u);
    setUrls((s) => s.filter((_, j) => j !== i));
  };
  const btn: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 5, height: 30, padding: "0 11px", border: "1px solid #CBD0D9", borderRadius: 7, background: "#fff", color: "#3A4150", fontFamily: "inherit", fontSize: 12, fontWeight: 600, cursor: busy ? "default" : "pointer" };
  return (
    <div style={{ marginTop: 8, border: "1px solid #CBD0D9", borderRadius: 10, background: "#FBFCFD", padding: 12 }} data-testid="attach-editor">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "#3A4150" }}>첨부 · 링크 <span style={{ color: "#9AA1AE", fontWeight: 400 }}>(선택)</span></span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <label data-testid="ae-file-pick" style={btn}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8 11l4-4a2.5 2.5 0 0 1 3.5 3.5l-5 5a4 4 0 0 1-5.6-5.6l5-5" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          파일 첨부
          <input ref={fileRef} type="file" hidden disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUploadFile(f); if (fileRef.current) fileRef.current.value = ""; }} />
        </label>
        <button onClick={() => setUrls((s) => [...s, ""])} data-testid="ae-url-add" style={btn}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.3-2.3a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0L5 10.8a3 3 0 0 0 4.2 4.2l1-1" stroke="#6B7280" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          URL 추가
        </button>
      </div>
      {urls.map((u, i) => (
        <div key={i} style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }} data-testid="ae-url-row">
          <input value={u} autoFocus onChange={(e) => setUrls((s) => s.map((x, j) => (j === i ? e.target.value : x)))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(i); } }} onBlur={() => send(i)} placeholder="https:// (입력 후 Enter)" data-testid="ae-url-input" style={{ flex: 1, minWidth: 0, height: 36, border: "1px solid #CBD0D9", borderRadius: 8, padding: "0 12px", fontFamily: "inherit", fontSize: 14, outline: "none" }} />
          <button onClick={() => setUrls((s) => s.filter((_, j) => j !== i))} title="제거" style={{ flex: "none", width: 36, height: 36, border: "1px solid #E2E5EB", borderRadius: 8, background: "#fff", color: "#9AA1AE", fontFamily: "inherit", fontSize: 15, cursor: "pointer" }}>✕</button>
        </div>
      ))}
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

function TaskRow({ t, busy, editable = true, rejectedMode = false, reorderable = false, dragging = false, onDragStart, onMarkDone, onComment, onMenu, onDelete, attach, projCust }: { t: ReportTask; busy: boolean; editable?: boolean; rejectedMode?: boolean; reorderable?: boolean; dragging?: boolean; onDragStart?: (e: React.PointerEvent) => void; onMarkDone: () => void; onComment: () => void; onMenu?: () => void; onDelete?: () => void; attach?: AttachProp; projCust?: Map<string, string | null> }) {
  const m = statusMeta(t.status);
  const rejected = t.rejectState === "반려";
  // editable=false(=view 읽기 전용)면 마감/⋯ 액션 숨김. 반려 모드는 editable=true로 전체 편집.
  const closeable = editable && (!rejectedMode || rejected);
  const inProgress = t.status === "진행중";
  // 제목/예정시간 아래 상세(설명·첨부·지연·반려·첨부에디터)는 전체폭 영역에 배치 → 박스 우측 끝이 ⋯ 버튼과 일치.
  const hasDetail = !!(t.description && t.description.trim()) || t.attachments.length > 0 || !!t.holdReason || rejected || !!attach;
  return (
    <div data-testid="task-row" data-task-id={t.id} data-todo-id={reorderable ? t.id : undefined} style={{ borderBottom: "1px solid #F2F3F6", boxShadow: rejected ? "inset 3px 0 0 #3B5BDB" : "none", paddingLeft: rejected ? 10 : 0, background: dragging ? "#F3F5FF" : "transparent" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: hasDetail ? "12px 0 0" : "12px 0" }}>
        {reorderable && (
          <button type="button" aria-label="순서 변경" title="드래그해서 순서 변경" data-testid={`drag-handle-${t.id}`} onPointerDown={onDragStart} style={{ flex: "none", width: 8, alignSelf: "stretch", margin: "-12px 0 -12px -8px", display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", padding: 0, cursor: "grab", color: dragging ? "#3B5BDB" : "#C2C7D0", touchAction: "none", WebkitTapHighlightColor: "transparent" }}>
            <svg width="4" height="16" viewBox="0 0 4 16" fill="currentColor"><circle cx="2" cy="2" r="1.3" /><circle cx="2" cy="6" r="1.3" /><circle cx="2" cy="10" r="1.3" /><circle cx="2" cy="14" r="1.3" /></svg>
          </button>
        )}
        <div style={{ width: 20, height: 20, borderRadius: 9999, flex: "none", marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: `1.5px solid ${inProgress ? "#2563EB" : "#CBD0D9"}` }}>
          {inProgress && <span style={{ width: 8, height: 8, borderRadius: 9999, background: "#2563EB" }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
            {t.project && projCust?.get(t.project) && <span style={{ fontSize: 11, fontWeight: 500, color: "#9AA1AE" }}>{projCust?.get(t.project)}</span>}
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1F2B" }}>{t.title}</span>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status === "계획" ? "예정" : t.status}</span>
            {t.isNight && <span style={{ fontSize: 11, fontWeight: 600, color: "#8A6508", background: "#FBF4DA", border: "1px solid #EFE0A6", borderRadius: 6, padding: "2px 7px" }}>🌙 야간</span>}
          </div>
          {(t.plannedStart || t.plannedDurationMin != null) && (
            <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 4 }} className="tnum">
              {t.plannedStart ? `예정 ${t.plannedStart}` : ""}{t.plannedDurationMin != null ? ` · ${fmtDur(t.plannedDurationMin)}` : ""}
            </div>
          )}
        </div>
        {closeable && (
          <button data-id={t.id} onClick={onMarkDone} disabled={busy} data-testid={`mark-done-${t.id}`} style={{ flex: "none", background: "#3B5BDB", border: "none", color: "#fff", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "6px 14px", marginTop: 1 }}>마감</button>
        )}
        <CommentButton count={t.commentCount} unread={t.commentUnread} leaderUnread={t.commentLeaderUnread} onClick={onComment} />
        {onMenu && closeable && <MenuButton onEdit={onMenu} onClose={onMarkDone} onDelete={onDelete ?? (() => {})} closeLabel="마감" />}
      </div>
      {hasDetail && (
        <div style={{ paddingLeft: 30, paddingBottom: 12 }}>
          <TaskDescBox desc={t.description} />
          <TaskAttachChips atts={t.attachments} />
          {t.holdReason && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#B45309", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 6, padding: "3px 8px", marginTop: 6 }}>지연 사유 · {t.holdReason}</div>}
          {rejected && <RejectBand comment={t.rejectComment} />}
          {attach && (attach.open ? (
            <AttachLinkEditor busy={busy} onUploadFile={attach.onUploadFile} onUploadUrl={attach.onUploadUrl} />
          ) : (
            <button onClick={attach.onToggle} data-testid="task-att-add" style={{ display: "block", marginTop: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3B5BDB", padding: 0 }}>＋ 첨부파일·코멘트 (선택)</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ResultBucket({ testid, zone, icon, name, range, tasks, editable, rejectedMode = false, busy, onReopen, onComment, onMenu, onDelete, attachOpenId, onAttachToggle, onAttachUploadFile, onAttachUploadUrl, emptyText, projCust }: { testid: string; zone: string; icon: string; name: string; range: string; tasks: ReportTask[]; editable: boolean; rejectedMode?: boolean; busy: boolean; onReopen: (id: number, ackReject: boolean) => void; onComment: (t: ReportTask, zone: string) => void; onMenu?: (t: ReportTask) => void; onDelete?: (t: ReportTask) => void; attachOpenId?: number | null; onAttachToggle?: (id: number) => void; onAttachUploadFile?: (id: number, file: File) => void; onAttachUploadUrl?: (id: number, url: string) => void; emptyText: string; projCust?: Map<string, string | null> }) {
  // 디자인: 헤더 우측 배지 = '완결 N'(+지연 M 있으면 ' · 지연 M'), 초록 톤
  const doneN = tasks.filter((t) => t.status === "완결").length;
  const delayedN = tasks.filter((t) => t.status === "지연").length;
  return (
    <div data-testid={testid} style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 12, boxShadow: "0 1px 3px rgba(16,24,40,.08)", marginBottom: 16, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", background: "#FAFBFC", flexWrap: "wrap" }}>
        <span style={{ fontSize: 15, fontWeight: 600 }}>{icon}{name}</span>
        <span style={{ fontSize: 12, color: "#9AA1AE" }} className="tnum">{range}</span>
        <div style={{ flex: 1, minWidth: 4 }} />
        <span className="badge" style={{ color: "#1F7A46", background: "#E7F5EC", border: "1px solid #BCE5CC" }}>완결 {doneN}{delayedN > 0 ? ` · 지연 ${delayedN}` : ""}</span>
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
            const showAttach = editable && !!onAttachToggle;
            const hasDetail = !!(t.description && t.description.trim()) || t.attachments.length > 0 || !!t.holdReason || rejected || showAttach;
            return (
              <div key={t.id} data-testid="task-row" data-task-id={t.id} style={{ borderBottom: "1px solid #F2F3F6", boxShadow: rejected ? "inset 3px 0 0 #3B5BDB" : "none", paddingLeft: rejected ? 10 : 0 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: hasDetail ? "12px 0 0" : "12px 0" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 9999, flex: "none", marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", background: delay ? "#fff" : "#1F9254", border: `1.5px solid ${delay ? "#F5C2C2" : "#1F9254"}`, color: delay ? "#DC2626" : "#fff", fontSize: 11, fontWeight: 700 }}>{delay ? "!" : "✓"}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      {t.project && <span style={{ fontSize: 11, fontWeight: 600, color: "#2F49B0", background: "#EEF2FF", borderRadius: 6, padding: "2px 7px" }}>{t.project}</span>}
            {t.project && projCust?.get(t.project) && <span style={{ fontSize: 11, fontWeight: 500, color: "#9AA1AE" }}>{projCust?.get(t.project)}</span>}
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1F2B" }}>{t.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 6, background: m.bg, border: `1px solid ${m.line}`, color: m.main }}>{t.status === "계획" ? "예정" : t.status}</span>
                      {t.doneTime && <span style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", background: "#F1F2F4", borderRadius: 6, padding: "2px 7px" }} className="tnum">✓ 마감 {t.doneTime}</span>}
                    </div>
                    {(t.plannedDurationMin != null || t.actualDurationMin != null) && (
                      <div style={{ fontSize: 12, color: "#9AA1AE", marginTop: 4 }} className="tnum">
                        {t.plannedDurationMin != null ? `예정 ${fmtDur(t.plannedDurationMin)}` : ""}
                        {t.actualDurationMin != null ? `${t.plannedDurationMin != null ? " · " : ""}실제 ${fmtDur(t.actualDurationMin)}` : ""}
                      </div>
                    )}
                  </div>
                  {canReopen && (
                    <button data-id={t.id} onClick={() => onReopen(t.id, rejected)} disabled={busy} data-testid={`reopen-${t.id}`} style={{ flex: "none", background: "#fff", border: "1px solid #CBD0D9", color: "#6B7280", borderRadius: 7, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, padding: "5px 11px", marginTop: 1 }}>마감 취소</button>
                  )}
                  <CommentButton count={t.commentCount} unread={t.commentUnread} leaderUnread={t.commentLeaderUnread} onClick={() => onComment(t, zone)} />
                  {onMenu && canReopen && <MenuButton onEdit={() => onMenu(t)} onClose={() => onReopen(t.id, rejected)} onDelete={() => onDelete?.(t)} closeLabel="마감 취소" />}
                </div>
                {hasDetail && (
                  <div style={{ paddingLeft: 30, paddingBottom: 12 }}>
                    <TaskDescBox desc={t.description} />
                    <TaskAttachChips atts={t.attachments} />
                    {t.holdReason && <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "#B45309", background: "#FDF3E5", border: "1px solid #F6D9A8", borderRadius: 6, padding: "3px 8px", marginTop: 6 }}>지연 사유 · {t.holdReason}</div>}
                    {rejected && <RejectBand comment={t.rejectComment} />}
                    {showAttach && (attachOpenId === t.id ? (
                      <AttachLinkEditor busy={busy} onUploadFile={(f) => onAttachUploadFile?.(t.id, f)} onUploadUrl={(u) => onAttachUploadUrl?.(t.id, u)} />
                    ) : (
                      <button onClick={() => onAttachToggle?.(t.id)} data-testid="task-att-add" style={{ display: "block", marginTop: 8, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: "#3B5BDB", padding: 0 }}>＋ 첨부파일·코멘트 (선택)</button>
                    ))}
                  </div>
                )}
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
