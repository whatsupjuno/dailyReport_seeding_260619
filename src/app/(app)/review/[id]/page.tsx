import { notFound, redirect } from "next/navigation";
import { requireReviewer } from "@/lib/auth/guard";
import { canReview, getReviewOwner } from "@/lib/data/review";
import { loadFullReport, type TaskRow } from "@/lib/data/reports";
import { attachmentsByReport } from "@/lib/data/attachments";
import { reviewQueueForReviewer } from "@/lib/data/review";
import { formatKoreanDate } from "@/lib/date";
import ReviewDetail, { type ReviewView, type ReviewAttachment } from "@/components/review/ReviewDetail";

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

  const [attachments, queue] = await Promise.all([
    attachmentsByReport(reportId),
    reviewQueueForReviewer(user),
  ]);
  const attMap = new Map<number, ReviewAttachment[]>();
  for (const a of attachments) {
    const arr = attMap.get(a.task_id) ?? [];
    arr.push({ id: a.id, kind: a.kind, fileName: a.file_name, url: a.url, comment: a.comment });
    attMap.set(a.task_id, arr);
  }
  const qi = queue.findIndex((q) => Number(q.report_id) === reportId);
  const queueNav =
    qi >= 0
      ? {
          position: `검수 대기 ${queue.length}건 중 ${qi + 1}번째`,
          prevId: queue[qi - 1]?.report_id ?? null,
          nextId: queue[qi + 1]?.report_id ?? null,
        }
      : { position: null, prevId: null, nextId: null };

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
    queueNav,
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
          attachments: attMap.get(t.id) ?? [],
        })),
    })),
    comms: full.comms.map((c) => ({ type: c.comm_type, counterpart: c.counterpart, time: c.occurred_at, summary: c.summary })),
    events: full.events.map((e) => ({ kind: e.kind, actorName: e.actor_name ?? null, comment: e.comment, rejectTarget: e.reject_target, at: e.created_at })),
  };

  return <ReviewDetail view={view} />;
}
