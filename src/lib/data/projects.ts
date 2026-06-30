import { query, queryOne } from "../db";

export type ProjectStatus = "진행중" | "보류" | "완료" | "보관";
export const PROJECT_STATUSES: ProjectStatus[] = ["진행중", "보류", "완료", "보관"];

export interface ProjectRow {
  id: number;
  name: string;
  cust_name: string | null;
  cust_contact: string | null;
  owner_user_id: number | null;
  owner_name: string | null; // users 조인으로 도출(표시용)
  status: ProjectStatus;
  note: string | null;
}

const SELECT_COLS = `p.id, p.name, p.cust_name, p.cust_contact, p.owner_user_id,
  o.name AS owner_name, p.status, p.note`;

/**
 * 프로젝트 목록. includeArchived=true(기본)면 '보관'까지 모두, false면 '보관' 제외.
 * 관리 화면은 보관 포함(보관 해제 가능), 작성 화면 드롭다운은 보관 제외를 쓴다.
 */
export async function listProjects(opts?: { includeArchived?: boolean }): Promise<ProjectRow[]> {
  const where = opts?.includeArchived === false ? `WHERE p.status <> '보관'` : "";
  return query<ProjectRow>(
    `SELECT ${SELECT_COLS}
       FROM projects p LEFT JOIN users o ON o.id = p.owner_user_id
       ${where}
      ORDER BY p.id`,
  );
}

/** 작성 화면 드롭다운용 — 보관 제외 프로젝트명(중복 제거·이름순). */
export async function listActiveProjectOptions(): Promise<{ name: string; custName: string | null }[]> {
  const rows = await query<{ name: string; cust_name: string | null }>(
    `SELECT name, max(cust_name) AS cust_name FROM projects WHERE status <> '보관' GROUP BY name ORDER BY name`,
  );
  return rows.map((r) => ({ name: r.name, custName: r.cust_name }));
}

export interface ProjectInput {
  name: string;
  custName: string;
  custContact?: string | null;
  ownerUserId: number;
  status?: ProjectStatus;
  note?: string | null;
}

function validate(input: ProjectInput): { name: string; custName: string; ownerUserId: number; status: ProjectStatus } {
  const name = (input.name ?? "").trim();
  const custName = (input.custName ?? "").trim();
  if (!name) throw new Error("NAME_REQUIRED");
  if (!custName) throw new Error("CUST_NAME_REQUIRED");
  if (!Number.isSafeInteger(input.ownerUserId) || input.ownerUserId <= 0) throw new Error("OWNER_REQUIRED");
  const status = input.status ?? "진행중";
  if (!PROJECT_STATUSES.includes(status)) throw new Error("INVALID_STATUS");
  return { name, custName, ownerUserId: input.ownerUserId, status };
}

export async function createProject(input: ProjectInput): Promise<{ id: number }> {
  const { name, custName, ownerUserId, status } = validate(input);
  const owner = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id=$1`, [ownerUserId]);
  if (!owner) throw new Error("OWNER_NOT_FOUND");
  const r = await queryOne<{ id: number }>(
    `INSERT INTO projects(name, cust_name, cust_contact, owner_user_id, status, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [name, custName, input.custContact?.trim() || null, ownerUserId, status, input.note?.trim() || null],
  );
  return { id: r!.id };
}

export async function updateProject(id: number, input: ProjectInput): Promise<void> {
  const { name, custName, ownerUserId, status } = validate(input);
  const cur = await queryOne<{ id: number }>(`SELECT id FROM projects WHERE id=$1`, [id]);
  if (!cur) throw new Error("NOT_FOUND");
  const owner = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id=$1`, [ownerUserId]);
  if (!owner) throw new Error("OWNER_NOT_FOUND");
  await query(
    `UPDATE projects SET name=$2, cust_name=$3, cust_contact=$4, owner_user_id=$5, status=$6, note=$7, updated_at=now()
      WHERE id=$1`,
    [id, name, custName, input.custContact?.trim() || null, ownerUserId, status, input.note?.trim() || null],
  );
}

export async function removeProject(id: number): Promise<void> {
  const cur = await queryOne<{ id: number }>(`SELECT id FROM projects WHERE id=$1`, [id]);
  if (!cur) throw new Error("NOT_FOUND");
  await query(`DELETE FROM projects WHERE id=$1`, [id]);
}
