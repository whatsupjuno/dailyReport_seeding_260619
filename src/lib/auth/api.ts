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

/** 경로 파라미터를 양의 정수로 파싱. 아니면 null */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
