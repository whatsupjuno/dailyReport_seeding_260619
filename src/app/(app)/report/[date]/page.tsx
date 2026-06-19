import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import {
  getOrCreateReport,
  getReportByUserDate,
  loadFullReport,
  recentTaskSuggestions,
  bucketedTasks,
  type TaskRow,
} from "@/lib/data/reports";
import { attachmentsByReport } from "@/lib/data/attachments";
import { commentMetaForReport } from "@/lib/data/comments";
import { taskRejectionMap } from "@/lib/data/task-rejections";
import { computeWriteMode } from "@/lib/domain/mode";
import { isV2Report } from "@/lib/domain/config";
import { formatKoreanDate, todayKstISO, kstHm } from "@/lib/date";
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

export default async function ReportPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidIsoDate(date)) notFound();
  const user = await requireUser();

  // 오늘 보고서만 자동 생성. 과거/타 날짜는 기존 것만 조회(임의 보고서 양산 방지)
  let reportId: number;
  if (date === todayKstISO()) {
    reportId = await getOrCreateReport(user.id, date);
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

  const [attachments, recentTasks, commentMeta, rejectMap] = await Promise.all([
    attachmentsByReport(reportId),
    recentTaskSuggestions(user.id),
    commentMetaForReport(reportId, user.id),
    taskRejectionMap(reportId),
  ]);
  const attMap = new Map<number, TaskAttachment[]>();
  for (const a of attachments) {
    const arr = attMap.get(a.task_id) ?? [];
    arr.push({ id: a.id, kind: a.kind, fileName: a.file_name, url: a.url, comment: a.comment });
    attMap.set(a.task_id, arr);
  }

  const mode = computeWriteMode(full.report.status, full.report.is_vacation);
  const buckets = bucketedTasks(full);
  const toTask = (t: TaskRow): ReportTask => ({
    id: t.id,
    project: t.project,
    title: t.title,
    status: t.status,
    plannedStart: t.planned_start,
    plannedDurationMin: t.planned_duration_min,
    doneTime: kstHm(t.completed_at),
    isNight: t.is_night,
    holdReason: t.hold_reason,
    rejectState: t.reject_state,
    rejectComment: rejectMap.get(t.id)?.comment ?? null,
    commentCount: commentMeta.get(t.id)?.count ?? 0,
    commentUnread: commentMeta.get(t.id)?.unread ?? false,
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
    todo: buckets.todo.map(toTask),
    am: buckets.am.map(toTask),
    pm: buckets.pm.map(toTask),
    night: buckets.night.map(toTask),
    comms: full.comms.map((c) => ({
      id: c.id,
      type: c.comm_type,
      counterpart: c.counterpart,
      time: c.occurred_at,
      summary: c.summary,
    })),
    events: full.events.map((e) => ({
      kind: e.kind,
      actorName: e.actor_name ?? null,
      comment: e.comment,
      rejectTarget: e.reject_target,
      at: e.created_at,
    })),
    recentTasks,
  };

  return <ReportEditor view={view} />;
}
