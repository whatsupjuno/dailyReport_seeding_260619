import crypto from "node:crypto";
import { env } from "../env";
import type { MailMessage, MailResult, MailTransport } from "./transport";

const NCP_HOST = "https://mail.apigw.ntruss.com";
const SEND_PATH = "/api/v1/mails";

/**
 * NCP API Gateway HMAC-SHA256 서명 (signature v2).
 * StringToSign = "{method} {url}\n{timestamp}\n{accessKey}"
 */
export function makeSignature(
  method: string,
  url: string,
  timestamp: string,
  accessKey: string,
  secretKey: string,
): string {
  const message = `${method} ${url}\n${timestamp}\n${accessKey}`;
  return crypto.createHmac("sha256", secretKey).update(message).digest("base64");
}

/** NCP Outbound Mailer 실제 전송기 (MAIL_TRANSPORT=ncp 일 때만 사용) */
export class NcpTransport implements MailTransport {
  readonly name = "ncp" as const;

  async send(msg: MailMessage): Promise<MailResult> {
    const { accessKeyId, secretKey } = env.ncp;
    if (!accessKeyId || !secretKey) {
      return { ok: false, id: "", transport: "ncp", error: "NCP credentials missing" };
    }
    const timestamp = String(Date.now());
    const signature = makeSignature("POST", SEND_PATH, timestamp, accessKeyId, secretKey);

    const payload = {
      senderAddress: env.mail.fromAddress,
      senderName: env.mail.fromName,
      title: msg.subject,
      body: msg.html,
      recipients: [
        { address: msg.to, name: msg.toName ?? msg.to, type: "R" },
      ],
      individual: true,
      advertising: false,
    };

    try {
      const res = await fetch(NCP_HOST + SEND_PATH, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ncp-apigw-timestamp": timestamp,
          "x-ncp-iam-access-key": accessKeyId,
          "x-ncp-apigw-signature-v2": signature,
        },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { requestId?: string };
      if (!res.ok) {
        return { ok: false, id: "", transport: "ncp", error: `HTTP ${res.status}` };
      }
      return { ok: true, id: data.requestId ?? "", transport: "ncp" };
    } catch (e) {
      return { ok: false, id: "", transport: "ncp", error: (e as Error).message };
    }
  }
}
