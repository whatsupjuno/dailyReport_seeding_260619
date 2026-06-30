import { notFound, redirect } from "next/navigation";
import { requireReviewer } from "@/lib/auth/guard";
import { parseId } from "@/lib/auth/api";
import { authorizeReview, canReview, canViewReview, getReviewOwner, reviewQueueForReviewer } from "@/lib/data/review";
import { loadFullReport, bucketedTasks, aiTimelineTasks, effectiveWindow, type TaskRow } from "@/lib/data/reports";
import { attachmentsByReport, commAttachmentsByReport } from "@/lib/data/attachments";
import { commentMetaForReport } from "@/lib/data/comments";
import { taskRejectionMap, getOpenTaskRejectCount } from "@/lib/data/task-rejections";
import { isV2Report } from "@/lib/domain/config";
import { formatKoreanDate, kstHm } from "@/lib/date";
import ReviewDetail, {
  type ReviewView,
  type ReviewAttachment,
  type ReviewTask,
} from "@/components/review/ReviewDetail";

const KIND_NAME: Record<string, string> = { plan: "오늘 계획", morning: "오전", afternoon: "오후", night: "야간" };

export default async function ReviewDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireReviewer();
  const reportId = parseId(id);
  if (reportId == null) notFound(); // 양의 정수만 허용(API 라우트와 동일 규칙) — 비정상 입력 시 404

  const owner = await getReviewOwner(reportId);
  if (!owner) notFound();
  // 열람 권한이 없으면 큐로. 관리자는 열람 가능(canViewReview), 액션 가능 여부는 canAct로 별도 판정.
  if (!(await canViewReview(user, owner))) redirect("/review");
  const canAct = await authorizeReview(user, owner);

  const full = await loadFullReport(reportId);
  if (!full) notFound();

  const [attachments, queue, commentMeta, rejectMap, openRejectCount, commAtt] = await Promise.all([
    attachmentsByReport(reportId),
    reviewQueueForReviewer(user),
    commentMetaForReport(reportId, user.id),
    taskRejectionMap(reportId),
    getOpenTaskRejectCount(reportId),
    commAttachmentsByReport(reportId),
  ]);
  const attMap = new Map<number, ReviewAttachment[]>();
  for (const a of attachments) {
    const arr = attMap.get(a.task_id) ?? [];
    arr.push({ id: a.id, kind: a.kind, fileName: a.file_name, url: a.url, comment: a.comment });
    attMap.set(a.task_id, arr);
  }
  const commAttMap = new Map<number, Array<{ id: number; fileName: string | null; url: string | null; comment: string | null }>>();
  for (const a of commAtt) {
    const arr = commAttMap.get(a.communication_id) ?? [];
    arr.push({ id: a.id, fileName: a.file_name, url: a.url, comment: a.comment });
    commAttMap.set(a.communication_id, arr);
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

  const roleLabel = user.role === "admin" ? "관리자" : user.role === "group_leader" ? "그룹장" : "직원";
  const v2 = isV2Report(full.report);

  const toReviewTask = (t: TaskRow): ReviewTask => {
    const rej = rejectMap.get(t.id);
    return {
      id: t.id,
      project: t.project,
      title: t.title,
      status: t.status,
      doneTime: kstHm(t.completed_at),
      isNight: t.is_night,
      plannedMin: t.planned_duration_min,
      actualMin: t.actual_duration_min,
      hold: t.hold_reason,
      description: t.description,
      attachments: attMap.get(t.id) ?? [],
      commentCount: commentMeta.get(t.id)?.count ?? 0,
      commentUnread: commentMeta.get(t.id)?.unread ?? false,
      commentLeaderUnread: commentMeta.get(t.id)?.leaderUnread ?? false,
      rejectComment: rej?.comment ?? null,
      rejectedBy: rej?.rejected_by_name ?? null,
      rejectedById: rej?.rejected_by ?? null,
    };
  };

  const base = {
    reportId,
    reviewerName: user.name,
    reviewerId: user.id,
    viewerRole: roleLabel,
    ownerName: owner.name,
    dept: owner.group_name,
    dateLabel: formatKoreanDate(full.report.report_date),
    status: full.report.status,
    isVacation: full.report.is_vacation,
    vacationType: full.report.vacation_type,
    vacationComment: full.report.vacation_comment,
    nightReason: full.report.night_reason,
    dailyComment: full.report.daily_comment,
    pending: full.report.status === "검수대기",
    reviewable: full.report.status === "검수대기" || full.report.status === "계획제출",
    canAct, // 액션(승인/반려/행반려) 권한. 관리자 열람전용이면 false → ReviewDetail 액션 숨김
    canRowReject: canReview(user, owner), // 행 반려 API와 동일한 셀프 금지 기준.
    // 계획 반려: 계획제출 단계 + 그룹장(셀프 제외). canReview(셀프 false)로 판정 → 본인 보고서엔 버튼 미노출.
    canPlanReject: full.report.status === "계획제출" && String(owner.user_id) !== String(user.id) && canReview(user, owner),
    openRejectCount,
    heldTaskCount: full.tasks.length, // 휴가 보고서에 남아있는 업무 행 수(검수 카드 표시)
    queueNav,
    isAi: effectiveWindow(full.report).isAi, // AI 그룹: 검수 화면도 24시간 단일 타임라인
    comms: full.comms.map((c) => ({ type: c.comm_type, counterpart: c.counterpart, time: c.occurred_at, summary: c.summary, attachments: commAttMap.get(c.id) ?? [] })),
    events: full.events.map((e) => ({ kind: e.kind, actorName: e.actor_name ?? null, comment: e.comment, rejectTarget: e.reject_target, at: e.created_at })),
  };

  const view: ReviewView = v2
    ? (() => {
        const b = bucketedTasks(full);
        const aiTl = base.isAi ? aiTimelineTasks(full) : null;
        return {
          ...base,
          model: 2,
          buckets: {
            todo: b.todo.map(toReviewTask),
            am: b.am.map(toReviewTask),
            pm: b.pm.map(toReviewTask),
            night: b.night.map(toReviewTask),
            aiDone: aiTl ? aiTl.done.map(toReviewTask) : [],
          },
        };
      })()
    : {
        ...base,
        model: 1,
        sections: full.sections.map((s) => ({
          kind: s.kind,
          name: KIND_NAME[s.kind] ?? s.kind,
          status: s.status,
          tasks: full.tasks.filter((t) => t.section_id === s.id).map(toReviewTask),
        })),
      };

  return <ReviewDetail view={view} />;
}
