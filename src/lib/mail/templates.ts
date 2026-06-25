import { env } from "../env";
import type { MailMessage } from "./transport";

function wrap(title: string, inner: string): string {
  return `<!doctype html><html lang="ko"><body style="font-family:Pretendard,system-ui,sans-serif;background:#f7f8fa;padding:24px;color:#1a1f2b">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e5eb;border-radius:12px;padding:28px">
    <div style="font-size:18px;font-weight:700;color:#3b5bdb">Seeding</div>
    <div style="font-size:12px;color:#6b7280;margin-bottom:18px">What The Hell Are You Doing?</div>
    <div style="font-size:16px;font-weight:700;margin-bottom:8px">${title}</div>
    ${inner}
  </div></body></html>`;
}

/** 이메일 본문에 들어가는 사용자 입력(반려 사유 등) 이스케이프 — HTML 깨짐/주입 방지 */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function button(link: string, label: string): string {
  return `<a href="${link}" style="display:inline-block;margin-top:12px;background:#3b5bdb;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px">${label}</a>
       <div style="font-size:12px;color:#9aa1ae;margin-top:14px">${env.mail.fromName}</div>`;
}

export function otpEmail(to: string, toName: string, otp: string): MailMessage {
  return {
    to,
    toName,
    kind: "otp",
    subject: "[Seeding] 로그인 인증번호",
    html: wrap(
      "로그인 인증번호",
      `<p style="font-size:14px;color:#3a4150">아래 4자리 인증번호를 로그인 화면에 입력해 주세요. (10분간 유효)</p>
       <div style="font-size:32px;font-weight:800;letter-spacing:8px;color:#1a1f2b;margin:14px 0">${otp}</div>`,
    ),
  };
}

export function reportInviteEmail(
  to: string,
  toName: string,
  kind: "plan_invite" | "morning_close" | "afternoon_close" | "night_close" | "reminder" | "rejected" | "submit_nag",
  link: string,
): MailMessage {
  const title: Record<string, string> = {
    plan_invite: "오늘 업무 계획을 작성해 주세요",
    morning_close: "오전 업무를 마감해 주세요",
    afternoon_close: "오후 업무를 마감해 주세요",
    night_close: "야간 업무 마감 시간입니다",
    reminder: "업무 보고가 아직 작성되지 않았어요",
    rejected: "보고서가 반려되었습니다 · 재작성이 필요해요",
    submit_nag: "[독촉] 오늘 업무 보고서를 아직 제출하지 않았어요",
  };
  return {
    to,
    toName,
    kind,
    subject: `[Seeding] ${title[kind]}`,
    html: wrap(
      title[kind],
      `<p style="font-size:14px;color:#3a4150">아래 버튼을 눌러 보고서를 작성/수정해 주세요.</p>
       <a href="${link}" style="display:inline-block;margin-top:12px;background:#3b5bdb;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font-weight:600;font-size:14px">보고서 열기</a>
       <div style="font-size:12px;color:#9aa1ae;margin-top:14px">${env.mail.fromName}</div>`,
    ),
  };
}

// ===== 이벤트(액션) 기반 알림 — 요청#2 =====

/** 반려(전역/계획) → 직원. 사유 포함(빈/짧은 사유는 폴백 문구). */
export function rejectEmail(to: string, toName: string, reason: string, link: string): MailMessage {
  const safe = reason && reason.trim() ? reason.trim() : "자세한 사유는 보고서에서 확인하세요.";
  return {
    to, toName, kind: "rejected",
    subject: "[Seeding] 보고서가 반려되었습니다 · 재작성이 필요해요",
    html: wrap(
      "보고서가 반려되었습니다",
      `<p style="font-size:14px;color:#3a4150">그룹장이 보고서를 반려했어요. 아래 사유를 확인하고 수정한 뒤 다시 제출해 주세요.</p>
       <div style="font-size:13px;color:#b91c1c;background:#fceceb;border:1px solid #f5c2c2;border-radius:8px;padding:12px;margin:12px 0;white-space:pre-wrap">${escapeHtml(safe)}</div>
       ${button(link, "보고서 열기")}`,
    ),
  };
}

/** 승인 완료 → 직원. */
export function approvedEmail(to: string, toName: string, link: string): MailMessage {
  return {
    to, toName, kind: "approved",
    subject: "[Seeding] 보고서가 승인되었습니다 🎉",
    html: wrap(
      "보고서가 승인되었습니다",
      `<p style="font-size:14px;color:#3a4150">제출한 업무 보고서가 그룹장의 승인을 받았어요. 수고하셨습니다 👍</p>
       ${button(link, "보고서 보기")}`,
    ),
  };
}

/** 제출 완료(컨펌 요청) → 그룹장. */
export function reviewRequestEmail(to: string, toName: string, authorName: string, link: string): MailMessage {
  return {
    to, toName, kind: "review_request",
    subject: `[Seeding] ${authorName}님의 보고서 검수가 필요합니다`,
    html: wrap(
      "검수(승인)가 필요해요",
      `<p style="font-size:14px;color:#3a4150"><b>${escapeHtml(authorName)}</b>님이 업무 보고서를 제출했어요. 검토 후 승인 또는 반려해 주세요.</p>
       ${button(link, "검수하러 가기")}`,
    ),
  };
}

/** 반려 후 재제출(재검수 요청) → 그룹장. */
export function resubmitReviewEmail(to: string, toName: string, authorName: string, link: string): MailMessage {
  return {
    to, toName, kind: "resubmit_review",
    subject: `[Seeding] ${authorName}님이 반려 보고서를 재작성했습니다`,
    html: wrap(
      "재검수가 필요해요",
      `<p style="font-size:14px;color:#3a4150"><b>${escapeHtml(authorName)}</b>님이 반려된 보고서를 수정해 다시 제출했어요. 재검토 후 승인 또는 반려해 주세요.</p>
       ${button(link, "재검수하러 가기")}`,
    ),
  };
}

/** 1차 계획 제출 → 그룹장(계획 컨펌/계획 반려 안내). */
export function planReviewRequestEmail(to: string, toName: string, authorName: string, link: string): MailMessage {
  return {
    to, toName, kind: "plan_review_request",
    subject: `[Seeding] ${authorName}님이 오늘 계획을 제출했습니다`,
    html: wrap(
      "계획 1차 컨펌이 필요해요",
      `<p style="font-size:14px;color:#3a4150"><b>${escapeHtml(authorName)}</b>님이 오늘 업무 계획을 제출했어요. 계획을 확인하고 그대로 진행하거나, 필요하면 ‘계획 반려’로 돌려보내 주세요.</p>
       ${button(link, "계획 확인하러 가기")}`,
    ),
  };
}
