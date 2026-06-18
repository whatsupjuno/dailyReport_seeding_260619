import { notFound, redirect } from "next/navigation";
import { requireReviewer } from "@/lib/auth/guard";
import { canReview, getReviewOwner } from "@/lib/data/review";
import { loadFullReport, type TaskRow } from "@/lib/data/reports";
import { formatKoreanDate } from "@/lib/date";
import ReviewDetail, { type ReviewView } from "@/components/review/ReviewDetail";

const KIND_NAME: Record<string, string> = { plan: "오늘 계획", morning: "오전", afternoon: "오후", night: "야간" };

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const reportId = Number(id);
  const user = await requireReviewer();

  const owner = await getReviewOwner(reportId);
  if (!owner) notFound();
  if (!canReview(user, owner)) redirect("/review");

  const full = await loadFullReport(reportId);
  if (!full) notFound();

  const view: ReviewView = {
    reportId,
    reviewerName: user.name,
    ownerName: owner.name,
    dept: owner.group_name,
    dateLabel: formatKoreanDate(full.report.report_date),
    status: full.report.status,
    isVacation: full.report.is_vacation,
    vacationType: full.report.vacation_type,
    nightReason: full.report.night_reason,
    dailyComment: full.report.daily_comment,
    pending: full.report.status === "검수대기",
    sections: full.sections.map((s) => ({
      kind: s.kind,
      name: KIND_NAME[s.kind] ?? s.kind,
      status: s.status,
      tasks: full.tasks
        .filter((t: TaskRow) => t.section_id === s.id)
        .map((t) => ({
          title: t.title,
          project: t.project,
          status: t.status,
          plannedMin: t.planned_duration_min,
          actualMin: t.actual_duration_min,
          hold: t.hold_reason,
        })),
    })),
    comms: full.comms.map((c) => ({ type: c.comm_type, counterpart: c.counterpart, time: c.occurred_at, summary: c.summary })),
    events: full.events.map((e) => ({ kind: e.kind, actorName: e.actor_name ?? null, comment: e.comment, rejectTarget: e.reject_target, at: e.created_at })),
  };

  return <ReviewDetail view={view} />;
}
