import { query } from "../db";
import { env } from "../env";
import { mailer } from "./index";
import type { MailMessage } from "./transport";
import { getUserById } from "../data/users";
import { rejectEmail, approvedEmail, reviewRequestEmail, resubmitReviewEmail } from "./templates";

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

/** 제출/재제출 → 그룹장에게. 리더 null(미기록)·비활성·셀프면 skip. */
export async function notifyLeaderReview(owner: Owner, reportId: number, kind: "review_request" | "resubmit_review"): Promise<void> {
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
    const tpl = kind === "review_request" ? reviewRequestEmail : resubmitReviewEmail;
    await record(leader.id, reportId, kind, tpl(leader.email, leader.name, owner.name, leaderLink(reportId)));
  } catch {
    /* best-effort */
  }
}
