import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/guard";
import {
  getOrCreateReport,
  getReportByUserDate,
  loadFullReport,
  sectionStatusMap,
  type TaskRow,
} from "@/lib/data/reports";
import { computeWriteMode } from "@/lib/domain/mode";
import { formatKoreanDate, todayKstISO } from "@/lib/date";
import ReportEditor, { type ReportView } from "@/components/report/ReportEditor";

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

  const secMap = sectionStatusMap(full.sections);
  const mode = computeWriteMode(full.report.status, full.report.is_vacation, secMap);

  const sections = full.sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    status: s.status,
    locked: s.locked,
    tasks: full.tasks.filter((t: TaskRow) => t.section_id === s.id),
  }));

  const view: ReportView = {
    reportId,
    date,
    dateLabel: formatKoreanDate(date),
    mode,
    status: full.report.status,
    isVacation: full.report.is_vacation,
    vacationType: full.report.vacation_type,
    nightHas: full.report.night_has,
    nightReason: full.report.night_reason,
    dailyComment: full.report.daily_comment,
    noCommunication: full.report.no_communication,
    submittedAt: full.report.submitted_at,
    sections,
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
  };

  return <ReportEditor view={view} />;
}
