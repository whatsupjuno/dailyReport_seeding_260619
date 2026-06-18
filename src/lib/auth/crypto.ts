import crypto from "node:crypto";

/** 타이밍 안전 문자열 비교 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function hmac(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

/** "value.sig" 형태로 서명 (쿠키/토큰 값 변조 방지) */
export function signValue(value: string, secret: string): string {
  return `${value}.${hmac(value, secret)}`;
}

/** 서명 검증 후 원본 value 반환, 실패 시 null */
export function verifySignedValue(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf(".");
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const sig = signed.slice(idx + 1);
  return safeEqual(sig, hmac(value, secret)) ? value : null;
}

/** 4자리 인증번호 생성 (디자인: 메일로 받는 4자리) */
export function generateOtp(): string {
  return String(crypto.randomInt(0, 10000)).padStart(4, "0");
}

/** OTP/토큰 해시 저장용 (평문 저장 금지). pepper로 secret 결합. */
export function hashSecret(value: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

/** 랜덤 토큰 (세션/링크) */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}
