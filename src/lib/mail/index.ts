import { env } from "../env";
import { LogTransport } from "./log";
import { NcpTransport } from "./ncp";
import type { MailTransport } from "./transport";

let _transport: MailTransport | null = null;

export function mailer(): MailTransport {
  if (_transport) return _transport;
  _transport = env.mail.transport === "ncp" ? new NcpTransport() : new LogTransport();
  return _transport;
}

export { LogTransport } from "./log";
export type { MailMessage, MailResult, MailTransport } from "./transport";
