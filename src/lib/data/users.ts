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
}

export async function findUserByLoginId(loginId: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT u.*, g.name AS group_name, g.leader_user_id
       FROM users u LEFT JOIN groups g ON g.id = u.group_id
      WHERE lower(u.login_id) = lower($1)`,
    [loginId],
  );
}

export async function getUserById(id: number): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `SELECT u.*, g.name AS group_name, g.leader_user_id
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
