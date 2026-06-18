// 메일 전송 추상화. dev/test는 LogTransport(실제 발송 X), 운영은 NcpTransport.

export interface MailMessage {
  to: string;
  toName?: string;
  subject: string;
  /** HTML 본문 */
  html: string;
  /** 분류용 태그 (로그/멱등성) */
  kind?: string;
}

export interface MailResult {
  ok: boolean;
  /** 전송 식별자 (NCP requestId 또는 log id) */
  id: string;
  transport: "log" | "ncp";
  error?: string;
}

export interface MailTransport {
  readonly name: "log" | "ncp";
  send(msg: MailMessage): Promise<MailResult>;
}
