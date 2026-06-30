import { query, queryOne } from "../db";
import { env } from "../env";
import { mailer } from "./index";
import type { MailMessage } from "./transport";
import { getUserById } from "../data/users";
import { getReviewOwner } from "../data/review";
import { allowedCommentRecipientIds } from "../data/comments";
import { computeCommentRecipients } from "../domain/comment-recipients";
import { rejectEmail, approvedEmail, reviewRequestEmail, resubmitReviewEmail, planReviewRequestEmail, timePolicyChangedEmail, commentEmail } from "./templates";

// 이벤트(액션) 기반 이메일 알림 — 상태변경 tx '커밋 후' best-effort 호출.
// notifications를 단일 원장으로: 항상 1행(sent/failed/skipped). id는 bigint(런타임 문자열)이므로 비교는 String 정규화.

async function reportDate(reportId: number): Promise<string | null> {
  const r = await query<{ d: string }>(`SELECT to_char(report_date,'YYYY-MM-DD') AS d FROM daily_reports WHERE id=$1`, [reportId]);
  return r[0]?.d ?? null;
}
const empLink = (date: string | null) => `${env.appBaseUrl}/report/${date ?? ""}`;
const leaderLink = (reportId: number) => `${env.appBaseUrl}/review/${reportId}`;

async function record(userId: number, reportId: number, kind: string, msg: MailMessage): Promise<void> {
  const res = await mailer().send(msg);
  await query(
    `INSERT INTO notifications(user_id, report_id, kind, subject, status, provider_id, sent_at, error)
     VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
    [userId, reportId, kind, msg.subject, res.ok ? "sent" : "failed", res.id || null, res.error ?? null],
  );
}
async function skip(userId: number | null, reportId: number, kind: string, reason: string): Promise<void> {
  if (userId == null) return; // notifications.user_id NOT NULL — 수신자 자체가 없으면 미기록
  await query(
    `INSERT INTO notifications(user_id, report_id, kind, subject, status, error) VALUES ($1,$2,$3,'(skipped)','skipped',$4)`,
    [userId, reportId, kind, reason],
  );
}

interface Owner {
  user_id: number;
  name: string;
  leader_user_id: number | null;
}

/** 반려(전역/계획) → 직원에게 rejected 메일. */
export async function notifyRejected(owner: Owner, reportId: number, reason: string): Promise<void> {
  try {
    const emp = await getUserById(owner.user_id);
    if (!emp?.email) return;
    const date = await reportDate(reportId);
    await record(emp.id, reportId, "rejected", rejectEmail(emp.email, emp.name, reason, empLink(date)));
  } catch {
    /* best-effort: 메일 실패가 액션을 막지 않음 */
  }
}

/** 승인 → 직원에게 approved 메일. 셀프승인(actor===owner)은 skipped 기록. */
export async function notifyApproved(owner: Owner, reportId: number, actorId: number): Promise<void> {
  try {
    if (String(actorId) === String(owner.user_id)) {
      await skip(owner.user_id, reportId, "approved", "self-approval");
      return;
    }
    const emp = await getUserById(owner.user_id);
    if (!emp?.email) return;
    const date = await reportDate(reportId);
    await record(emp.id, reportId, "approved", approvedEmail(emp.email, emp.name, empLink(date)));
  } catch {
    /* best-effort */
  }
}

/** 그룹 시간정책 변경 → 그룹 구성원(작성 대상)에게 안내 메일. best-effort. report 비귀속(report_id NULL). */
export async function notifyTimePolicyChanged(groupId: number, summary: string): Promise<void> {
  try {
    const members = await query<{ id: number; name: string; email: string | null }>(
      `SELECT id, name, email FROM users WHERE group_id=$1 AND active AND COALESCE(report_required,true) AND email IS NOT NULL`,
      [groupId],
    );
    const link = `${env.appBaseUrl}/login`;
    for (const m of members) {
      if (!m.email) continue;
      const msg = timePolicyChangedEmail(m.email, m.name, summary, link);
      const res = await mailer().send(msg);
      await query(
        `INSERT INTO notifications(user_id, report_id, kind, subject, status, provider_id, sent_at, error)
         VALUES ($1, NULL, 'time_policy_changed', $2, $3, $4, now(), $5)`,
        [m.id, msg.subject, res.ok ? "sent" : "failed", res.id || null, res.error ?? null],
      );
    }
  } catch {
    /* best-effort: 메일 실패가 정책 변경을 막지 않음 */
  }
}

/** 제출/재제출/계획제출 → 그룹장에게. 리더 null(미기록)·비활성·셀프면 skip. */
export async function notifyLeaderReview(owner: Owner, reportId: number, kind: "review_request" | "resubmit_review" | "plan_review_request"): Promise<void> {
  try {
    const leaderId = owner.leader_user_id;
    if (leaderId == null) return; // 리더 없음 → 수신자 없음(미기록)
    if (String(leaderId) === String(owner.user_id)) {
      await skip(leaderId, reportId, kind, "leader is owner (self)");
      return;
    }
    const leader = await getUserById(leaderId);
    if (!leader) return;
    if (!leader.active) {
      await skip(leaderId, reportId, kind, "leader inactive");
      return;
    }
    if (!leader.email) return;
    const tpl = kind === "review_request" ? reviewRequestEmail : kind === "resubmit_review" ? resubmitReviewEmail : planReviewRequestEmail;
    await record(leader.id, reportId, kind, tpl(leader.email, leader.name, owner.name, leaderLink(reportId)));
  } catch {
    /* best-effort */
  }
}

/** 댓글 본문 발췌 — 공백 정규화 후 최대 길이 컷(메일 미리보기용). */
function excerpt(body: string, max = 160): string {
  const s = (body ?? "").trim().replace(/\s+/g, " ");
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export interface CommentNotifyParams {
  taskId: number;
  reportId: number;
  /** 댓글 작성자 user id */
  authorId: number;
  /** 댓글 본문(발췌용) */
  body: string;
  /** 대댓글 여부 */
  isReply: boolean;
  /** 대댓글일 때 부모 댓글 작성자 id(없으면 null) */
  parentAuthorId: number | null;
  /** task_comments.mentions — 서버 해석된 멘션 대상 id(본문 재파싱 금지) */
  mentions: number[];
}

/**
 * 댓글/대댓글/@멘션 → 수신자에게 즉시 메일 + notifications INSERT(승인/반려 즉시발송 미러링).
 * 수신자 규칙은 computeCommentRecipients(순수 로직)에 위임하고, 발송 직전 댓글 열람권을 재검증한다.
 * 비활성=skipped 기록, 이메일 없음=미기록.
 * 수신자별 try/catch + 전체 try/catch로 비차단(메일 실패가 댓글 저장을 깨뜨리지 않음).
 */
export async function notifyComment(params: CommentNotifyParams): Promise<void> {
  try {
    const { taskId, reportId, authorId, body, isReply, parentAuthorId, mentions } = params;
    const owner = await getReviewOwner(reportId);
    if (!owner) return;
    const author = await getUserById(authorId);
    const authorName = author?.name ?? "(작성자)";
    const taskRow = await queryOne<{ title: string }>(`SELECT title FROM tasks WHERE id=$1`, [taskId]);
    const taskTitle = taskRow?.title ?? "업무";
    const date = await reportDate(reportId);
    const snippet = excerpt(body);
    const allowedRecipients = await allowedCommentRecipientIds(reportId);

    const recipients = computeCommentRecipients({
      authorId,
      ownerId: owner.user_id,
      reviewerId: owner.leader_user_id ?? null,
      isReply,
      parentAuthorId,
      mentions: mentions ?? [],
    });

    for (const r of recipients) {
      try {
        if (!allowedRecipients.has(Number(r.userId))) continue;
        const u = await getUserById(r.userId);
        if (!u) continue;
        if (!u.active) {
          await skip(r.userId, reportId, r.kind, "recipient inactive");
          continue;
        }
        if (!u.email) continue; // 이메일 없으면 미기록(기존 패턴)
        // 수신자가 보고서 owner면 작성 화면(/report/날짜), 아니면 검수 화면(/review/리포트)
        const link = String(r.userId) === String(owner.user_id) ? empLink(date) : leaderLink(reportId);
        await record(u.id, reportId, r.kind, commentEmail(u.email, u.name, r.kind, authorName, taskTitle, snippet, link));
      } catch {
        /* 수신자 1명 실패가 나머지 수신자를 막지 않음 */
      }
    }
  } catch {
    /* best-effort: 알림 실패가 댓글 저장을 깨뜨리지 않음 */
  }
}
