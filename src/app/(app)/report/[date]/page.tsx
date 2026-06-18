import { requireUser } from "@/lib/auth/guard";
import {
  getOrCreateReport,
  loadFullReport,
  sectionStatusMap,
  type TaskRow,
} from "@/lib/data/reports";
import { computeWriteMode } from "@/lib/domain/mode";
import { formatKoreanDate } from "@/lib/date";
import ReportEditor, { type ReportView } from "@/components/report/ReportEditor";

export default async function ReportPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const user = await requireUser();

  const reportId = await getOrCreateReport(user.id, date);
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
