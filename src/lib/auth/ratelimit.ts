// 단순 인메모리 슬라이딩 윈도우 레이트리밋.
// 주의: 단일 인스턴스(cafe24) 기준. 다중 인스턴스 배포 시 Redis 등으로 교체 필요.

interface Entry {
  count: number;
  resetAt: number;
}
const store = new Map<string, Entry>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; retryAfter: number } {
  const now = Date.now();
  const e = store.get(key);
  if (!e || now > e.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  e.count++;
  if (e.count > limit) return { ok: false, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

/** 테스트 격리용 초기화 */
export function _resetRateLimit() {
  store.clear();
}
