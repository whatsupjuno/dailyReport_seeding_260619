import { query, queryOne } from "../db";
import type { UserRole } from "../domain/status";

export interface UserRow {
  id: number;
  login_id: string;
  name: string;
  email: string;
  role: UserRole;
  group_id: number | null;
  active: boolean;
  group_name?: string | null;
  leader_user_id?: number | null;
  /** 고정 로그인 코드(4자리). 인증 조회에서만 채워짐 — 클라이언트로 노출 금지. */
  login_code?: string;
}

const SAFE_COLS = `u.id, u.login_id, u.name, u.email, u.role, u.group_id, u.active,
  g.name AS group_name, g.leader_user_id`;

/** 인증용: login_code 포함 (서버 인증 로직에서만 사용) */
export async function findUserByLoginId(loginId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT ${SAFE_COLS}, u.login_code
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE lower(u.login_id) = lower($1)`,
    [loginId],
  );
}

/** 세션/표시용: login_code 제외 */
export async function getUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT ${SAFE_COLS}
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE u.id = $1`,
    [id],
  );
}

export interface AdminUserRow extends UserRow {
  group_name: string | null;
}

export async function listUsers(): Promise<AdminUserRow[]> {
  return query<AdminUserRow>(
    `SELECT u.*, g.name AS group_name
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      ORDER BY u.id`,
  );
}
