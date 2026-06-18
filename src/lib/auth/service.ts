import { env } from "../env";
import { query, queryOne } from "../db";
import { findUserByLoginId } from "../data/users";
import { mailer } from "../mail";
import { otpEmail } from "../mail/templates";
import { generateOtp, hashSecret } from "./crypto";

const OTP_TTL_MIN = 10;
const MAX_ATTEMPTS = 5;

export interface RequestOtpResult {
  ok: boolean;
  /** dev/test(MAIL_TRANSPORT=log)에서만 노출 */
  devOtp?: string;
}

/** 아이디로 OTP 발급 + 메일 발송. 존재 여부는 노출하지 않음(열거 방지). */
export async function requestOtp(loginId: string): Promise<RequestOtpResult> {
  const user = await findUserByLoginId(loginId);
  if (!user || !user.active) return { ok: true };

  const otp = generateOtp();
  const expires = new Date(Date.now() + OTP_TTL_MIN * 60_000);
  await query(
    `INSERT INTO auth_otps(user_id, otp_hash, expires_at) VALUES ($1,$2,$3)`,
    [user.id, hashSecret(otp, env.sessionSecret), expires],
  );
  await mailer().send(otpEmail(user.email, user.name, otp));

  const devLeak = env.mail.transport === "log" && process.env.NODE_ENV !== "production";
  return { ok: true, ...(devLeak ? { devOtp: otp } : {}) };
}

export interface VerifyResult {
  ok: boolean;
  userId?: number;
  error?: string;
}

/** OTP 검증. 성공 시 userId 반환(세션 생성은 호출부에서). */
export async function verifyOtp(loginId: string, otp: string): Promise<VerifyResult> {
  const user = await findUserByLoginId(loginId);
  if (!user || !user.active) return { ok: false, error: "존재하지 않는 아이디입니다. 다시 확인해 주세요." };

  const row = await queryOne<{ id: number; otp_hash: string; attempts: number }>(
    `SELECT id, otp_hash, attempts FROM auth_otps
      WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
      ORDER BY id DESC LIMIT 1`,
    [user.id],
  );
  if (!row) return { ok: false, error: "인증번호가 만료되었거나 발급되지 않았습니다. 다시 받아 주세요." };
  if (row.attempts >= MAX_ATTEMPTS)
    return { ok: false, error: "인증 시도 횟수를 초과했습니다. 인증번호를 다시 받아 주세요." };

  const match = row.otp_hash === hashSecret(otp, env.sessionSecret);
  if (!match) {
    await query(`UPDATE auth_otps SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
    return { ok: false, error: "인증번호가 일치하지 않습니다. 다시 입력해 주세요." };
  }
  await query(`UPDATE auth_otps SET consumed_at = now() WHERE id = $1`, [row.id]);
  return { ok: true, userId: user.id };
}
