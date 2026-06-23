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
