import { cookies } from "next/headers";
import { env } from "../env";
import { query, queryOne } from "../db";
import { getUserById, type UserRow } from "../data/users";
import { randomToken, signValue, verifySignedValue } from "./crypto";

const COOKIE = "sid";
const SESSION_DAYS = 7;

export async function createSession(userId: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query(`INSERT INTO sessions(token, user_id, expires_at) VALUES ($1,$2,$3)`, [
    token,
    userId,
    expires,
  ]);
  const jar = await cookies();
  jar.set(COOKIE, signValue(token, env.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    // HTTPS로 서빙될 때만 Secure. (현재 HTTP(IP) 배포에서 Secure면 브라우저가 쿠키를 버림)
    secure: env.appBaseUrl.startsWith("https"),
    path: "/",
    expires,
  });
  return token;
}

export async function getSessionUser(): Promise<UserRow | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const token = verifySignedValue(raw, env.sessionSecret);
  if (!token) return null;
  const row = await queryOne<{ user_id: number }>(
    `SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()`,
    [token],
  );
  if (!row) return null;
  return getUserById(row.user_id);
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    const token = verifySignedValue(raw, env.sessionSecret);
    if (token) await query(`DELETE FROM sessions WHERE token = $1`, [token]);
  }
  jar.delete(COOKIE);
}
