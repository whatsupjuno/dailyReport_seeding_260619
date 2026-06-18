import type { MailMessage, MailResult, MailTransport } from "./transport";

/**
 * 실제 발송하지 않고 콘솔에 기록하는 전송기 (dev/test 기본).
 * 마지막으로 보낸 메시지들을 메모리에 보관 → 테스트에서 OTP 등 확인 가능.
 */
export class LogTransport implements MailTransport {
  readonly name = "log" as const;
  static readonly outbox: Array<MailMessage & { at: string; id: string }> = [];

  async send(msg: MailMessage): Promise<MailResult> {
    const id = "log_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    LogTransport.outbox.push({ ...msg, at: new Date().toISOString(), id });
    // 운영 로그에 본문 전체를 남기지 않도록 요약만 출력
    // eslint-disable-next-line no-console
    console.log(`[mail:log] -> ${msg.to} | ${msg.kind ?? "-"} | ${msg.subject}`);
    return { ok: true, id, transport: "log" };
  }
}
