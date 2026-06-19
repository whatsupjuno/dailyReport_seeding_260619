import { NextResponse } from "next/server";
import { getSessionUser } from "./session";
import type { UserRow } from "../data/users";

/** API용 인증: 세션 사용자 or null */
export async function apiUser(): Promise<UserRow | null> {
  return getSessionUser();
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
}
export function forbidden() {
  return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
}
export function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}
export function conflict(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 409 });
}

/**
 * 경로 파라미터를 양의 정수로 파싱. 아니면 null.
 * 정규 10진수만 허용(1e3·0x10·5.0·" 5" 등 비정규/거대값 차단) — DB 범위초과 500 방지.
 */
export function parseId(raw: string): number | null {
  if (!/^[1-9][0-9]{0,14}$/.test(raw)) return null; // 선행0/부호/지수/공백 불가, 15자리 이내(안전정수)
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
