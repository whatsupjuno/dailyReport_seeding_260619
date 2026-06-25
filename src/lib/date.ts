const TZ = "Asia/Seoul";
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

/** 현재 KST 날짜를 'YYYY-MM-DD'로 */
export function todayKstISO(now: Date = new Date()): string {
  // en-CA 로케일은 YYYY-MM-DD 형식
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * 경계시각 반영 '현재 보고일'(KST 'YYYY-MM-DD'). now에서 boundaryHour를 뺀 시점의 KST 날짜 = 윈도우 시작일.
 * - boundaryHour=0(비-AI): todayKstISO(now)와 동일.
 * - boundaryHour=9(AI): 00:00~08:59는 전날(윈도우 시작일)로 귀속, 09:00~23:59는 당일.
 */
export function reportDateForBoundary(boundaryHour: number, now: Date = new Date()): string {
  const shifted = new Date(now.getTime() - boundaryHour * 3_600_000);
  return todayKstISO(shifted);
}

/** 'YYYY-MM-DD' → '2026년 6월 18일 (목)' */
export function formatKoreanDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  // 요일은 UTC 정오 기준으로 계산(타임존 경계 안전)
  const dow = DOW[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 (${dow})`;
}

/** timestamptz(Date|string|null) → KST 'HH:MM' (없으면 null) */
export function kstHm(d: Date | string | null): string | null {
  if (d == null) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** 'YYYY-MM-DD' → '06-18' */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${m}-${d}`;
}

/** 'YYYY-MM-DD' → '목' */
export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return DOW[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
}

/** KST 기준 평일 여부(0=일,6=토 제외) */
export function isWeekdayKst(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
  return dow >= 1 && dow <= 5;
}
