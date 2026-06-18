import { query, queryOne } from "../db";

export interface GroupWithMembers {
  id: number;
  name: string;
  leader_id: number | null;
  leader_name: string | null;
  members: Array<{ id: number; name: string }>;
}

export async function listGroupsWithMembers(): Promise<GroupWithMembers[]> {
  const groups = await query<{ id: number; name: string; leader_id: number | null; leader_name: string | null }>(
    `SELECT g.id, g.name, g.leader_user_id AS leader_id, l.name AS leader_name
       FROM groups g LEFT JOIN users l ON l.id = g.leader_user_id
      ORDER BY g.id`,
  );
  const members = await query<{ group_id: number; id: number; name: string }>(
    `SELECT group_id, id, name FROM users WHERE group_id IS NOT NULL AND active ORDER BY name`,
  );
  return groups.map((g) => ({
    ...g,
    members: members.filter((m) => m.group_id === g.id).map((m) => ({ id: m.id, name: m.name })),
  }));
}

export interface CreateUserInput {
  name: string;
  loginId: string;
  email: string;
  role: "employee" | "group_leader" | "admin";
  groupId: number | null;
  loginCode?: string;
}

export async function createUser(input: CreateUserInput): Promise<{ id: number }> {
  const dup = await queryOne<{ id: number }>(`SELECT id FROM users WHERE lower(login_id)=lower($1)`, [
    input.loginId,
  ]);
  if (dup) throw new Error("DUPLICATE_LOGIN_ID");
  const r = await queryOne<{ id: number }>(
    `INSERT INTO users(login_id, name, email, role, group_id, login_code)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [input.loginId, input.name, input.email, input.role, input.groupId, input.loginCode ?? "1234"],
  );
  return { id: r!.id };
}

export async function listGroupOptions(): Promise<Array<{ id: number; name: string }>> {
  return query<{ id: number; name: string }>(`SELECT id, name FROM groups ORDER BY id`);
}
