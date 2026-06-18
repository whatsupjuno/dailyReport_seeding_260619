import { findUserByLoginId } from "../data/users";
import { safeEqual } from "./crypto";

// NOTE: OTP 발급/메일 발송은 추후 구현. 현재는 users.login_code(고정 4자리)로 인증.

export interface RequestOtpResult {
  ok: boolean;
  /** dev/test에서만 노출 — 현재 고정 코드를 화면에 안내하기 위함 */
  devOtp?: string;
}

/** 고정 코드 방식: 발급/메일 없음. dev에선 해당 사용자의 고정 코드를 반환. */
export async function requestOtp(loginId: string): Promise<RequestOtpResult> {
  const user = await findUserByLoginId(loginId);
  if (!user || !user.active) return { ok: true };
  const devLeak = process.env.NODE_ENV !== "production";
  return { ok: true, ...(devLeak && user.login_code ? { devOtp: user.login_code } : {}) };
}

export interface VerifyResult {
  ok: boolean;
  userId?: number;
  error?: string;
}

/** 고정 코드 검증 */
export async function verifyOtp(loginId: string, otp: string): Promise<VerifyResult> {
  const user = await findUserByLoginId(loginId);
  if (!user || !user.active)
    return { ok: false, error: "존재하지 않는 아이디입니다. 다시 확인해 주세요." };
  if (!user.login_code || !safeEqual(otp.trim(), user.login_code.trim()))
    return { ok: false, error: "인증번호가 일치하지 않습니다. 다시 입력해 주세요." };
  return { ok: true, userId: user.id };
}
