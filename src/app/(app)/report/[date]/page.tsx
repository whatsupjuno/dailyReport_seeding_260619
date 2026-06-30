import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/guard";
import {
  getOrCreateReport,
  getReportByUserDate,
  loadFullReport,
  recentTaskSuggestions,
  bucketedTasks,
  aiTimelineTasks,
  effectiveWindow,
  getUserGroupWindow,
  type TaskRow,
} from "@/lib/data/reports";
import { boundaryHour } from "@/lib/domain/window";
import { attachmentsByReport, commAttachmentsByReport } from "@/lib/data/attachments";
import { commentMetaForReport } from "@/lib/data/comments";
import { taskRejectionMap } from "@/lib/data/task-rejections";
import { listCarryoverCandidates } from "@/lib/data/report-mutations";
import { computeWriteMode } from "@/lib/domain/mode";
import { isV2Report } from "@/lib/domain/config";
import { formatKoreanDate, todayKstISO, reportDateForBoundary, kstHm } from "@/lib/date";
import ReportEditor, {
  type ReportView,
  type ReportTask,
  type TaskAttachment,
} from "@/components/report/ReportEditor";
import LegacyReportEditor, {
  buildLegacyView,
} from "@/components/report/LegacyReportEditor";

function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + "T00:00:00Z");
  return !Number.isNaN(t);
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ write?: string }>;
}) {
  const { date } = await params;
  const { write } = await searchParams;
  if (!isValidIsoDate(date)) notFound();
  const user = await requireUser();
  // 그룹 경계 반영 '현재 보고일'(AI=09:00 경계 → 자정 넘김 윈도우를 한 보고서로). 비-AI는 todayKstISO와 동일.
  const userWin = await getUserGroupWindow(user.id);
  const todayForUser = reportDateForBoundary(boundaryHour(userWin));

  // 오늘 보고서만 자동 생성. 과거/타 날짜는 기존 것만 조회(임의 보고서 양산 방지)
  let reportId: number;
  if (date === todayForUser) {
    if (!user.report_required) {
      // 작성 대상이 아니면 자동 생성하지 않음 — 기존 보고서가 있으면 그대로, 없으면 안내(원할 때만 ?write=1로 작성)
      const existing = await getReportByUserDate(user.id, date);
      if (existing) {
        reportId = existing.id;
      } else if (write === "1") {
        reportId = await getOrCreateReport(user.id, date);
      } else {
        return <NotReportTargetNotice date={date} canReview={user.role === "group_leader" || user.role === "admin"} />;
      }
    } else {
      reportId = await getOrCreateReport(user.id, date);
    }
  } else {
    const existing = await getReportByUserDate(user.id, date);
    if (!existing) notFound();
    reportId = existing.id;
  }
  const full = await loadFullReport(reportId);
  if (!full) return <div style={{ padding: 24 }}>보고서를 불러오지 못했습니다.</div>;

  // 레거시(v1) 보고서는 동결 렌더 — 섹션 순차 모델
  if (!isV2Report(full.report)) {
    return <LegacyReportEditor view={buildLegacyView(full, date)} />;
  }

  const [attachments, recentTasks, commentMeta, rejectMap, commAtt, carryoverCandidates] = await Promise.all([
    attachmentsByReport(reportId),
    recentTaskSuggestions(user.id),
    commentMetaForReport(reportId, user.id),
    taskRejectionMap(reportId),
    commAttachmentsByReport(reportId),
    listCarryoverCandidates(reportId),
  ]);
  const commAttMap = new Map<number, Array<{ id: number; fileName: string | null; url: string | null; comment: string | null }>>();
  for (const a of commAtt) {
    const arr = commAttMap.get(a.communication_id) ?? [];
    arr.push({ id: a.id, fileName: a.file_name, url: a.url, comment: a.comment });
    commAttMap.set(a.communication_id, arr);
  }
  const attMap = new Map<number, TaskAttachment[]>();
  for (const a of attachments) {
    const arr = attMap.get(a.task_id) ?? [];
    arr.push({ id: a.id, kind: a.kind, fileName: a.file_name, url: a.url, comment: a.comment });
    attMap.set(a.task_id, arr);
  }

  const mode = computeWriteMode(full.report.status, full.report.is_vacation);
  const buckets = bucketedTasks(full);
  // 그룹 시간정책 스냅샷: AI면 오전/오후/야간 대신 24시간 완료 타임라인.
  const win = effectiveWindow(full.report);
  const aiTl = win.isAi ? aiTimelineTasks(full) : null;
  const submitDueHm = win.submitDue ? win.submitDue.slice(0, 5) : null; // 'HH:MM:SS' → 'HH:MM'
  const toTask = (t: TaskRow): ReportTask => ({
    id: t.id,
    project: t.project,
    title: t.title,
    status: t.status,
    plannedStart: t.planned_start,
    plannedDurationMin: t.planned_duration_min,
    doneTime: kstHm(t.completed_at),
    actualDurationMin: t.actual_duration_min,
    isNight: t.is_night,
    holdReason: t.hold_reason,
    description: t.description,
    rejectState: t.reject_state,
    rejectComment: rejectMap.get(t.id)?.comment ?? null,
    commentCount: commentMeta.get(t.id)?.count ?? 0,
    commentUnread: commentMeta.get(t.id)?.unread ?? false,
    commentLeaderUnread: commentMeta.get(t.id)?.leaderUnread ?? false,
    attachments: attMap.get(t.id) ?? [],
  });
  const roleLabel = user.role === "admin" ? "관리자" : user.role === "group_leader" ? "그룹장" : "직원";

  const view: ReportView = {
    reportId,
    date,
    dateLabel: formatKoreanDate(date),
    mode,
    status: full.report.status,
    viewerRole: roleLabel,
    isVacation: full.report.is_vacation,
    vacationType: full.report.vacation_type,
    vacationComment: full.report.vacation_comment,
    nightHas: full.report.night_has,
    nightReason: full.report.night_reason,
    dailyComment: full.report.daily_comment,
    noCommunication: full.report.no_communication,
    submittedAt: full.report.submitted_at,
    planSubmittedAt: full.report.plan_submitted_at,
    updatedAt: full.report.updated_at,
    todo: buckets.todo.map(toTask),
    am: buckets.am.map(toTask),
    pm: buckets.pm.map(toTask),
    night: buckets.night.map(toTask),
    isAi: win.isAi,
    aiDone: aiTl ? aiTl.done.map(toTask) : [],
    submitDueHm,
    comms: full.comms.map((c) => ({
      id: c.id,
      type: c.comm_type,
      counterpart: c.counterpart,
      time: c.occurred_at,
      summary: c.summary,
      attachments: commAttMap.get(c.id) ?? [],
    })),
    events: full.events.map((e) => ({
      kind: e.kind,
      actorName: e.actor_name ?? null,
      comment: e.comment,
      rejectTarget: e.reject_target,
      at: e.created_at,
    })),
    recentTasks,
    carryoverCandidates,
  };

  return <ReportEditor view={view} />;
}

/** 작성 대상이 아닌 사용자에게 작성 화면 대신 보여주는 안내(자동 보고서 생성 안 함). 원하면 직접 작성 가능. */
function NotReportTargetNotice({ date, canReview }: { date: string; canReview: boolean }) {
  const btn: React.CSSProperties = { height: 40, padding: "0 18px", borderRadius: 8, fontFamily: "inherit", fontSize: 14, fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center" };
  return (
    <div style={{ maxWidth: 560, margin: "0 auto", padding: "64px 24px" }} data-testid="not-report-target">
      <div style={{ background: "#fff", border: "1px solid #E2E5EB", borderRadius: 16, padding: "32px 28px", textAlign: "center", boxShadow: "0 1px 3px rgba(16,24,40,.08)" }}>
        <div style={{ width: 52, height: 52, borderRadius: 9999, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 24 }}>📋</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>작성 대상이 아닙니다</div>
        <div style={{ fontSize: 14, color: "#6B7280", marginTop: 8, lineHeight: "21px" }}>
          일일 업무 보고서 작성 대상이 아니에요. 작성 요청·미제출 독촉 안내를 보내지 않습니다.<br />
          작성 대상 설정은 관리자가 변경할 수 있습니다.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 24, flexWrap: "wrap" }}>
          <Link href={canReview ? "/review" : "/reports"} style={{ ...btn, border: "none", background: "#3B5BDB", color: "#fff" }}>{canReview ? "검수로 이동" : "목록 보기"}</Link>
          <Link href={`/report/${date}?write=1`} data-testid="write-anyway" style={{ ...btn, border: "1px solid #CBD0D9", background: "#fff", color: "#3A4150" }}>그래도 작성하기</Link>
        </div>
      </div>
    </div>
  );
}
