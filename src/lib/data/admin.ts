import { query, queryOne, tx } from "../db";

// 이메일 형식 검증(이중 @ 등 잘못된 형식 차단) — 정책: 저장되는 이메일은 항상 유효 형식이어야 함.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(s: string): boolean {
  return EMAIL_RE.test((s ?? "").trim());
}
/** 이메일 도출: 명시 입력이 있으면 그대로, 없으면 login_id가 이메일이면 그대로, 아니면 login_id@company.com. */
export function resolveEmail(loginId: string, email?: string): string {
  const e = (email ?? "").trim();
  if (e) return e;
  const lid = (loginId ?? "").trim();
  return isValidEmail(lid) ? lid : `${lid}@company.com`;
}

export interface GroupWithMembers {
  id: number;
  name: string;
  leader_id: number | null;
  leader_name: string | null;
  is_ai_group: boolean;
  write_start: string; // 'HH:MM'
  write_end: string; // 'HH:MM'
  submit_due: string | null; // 'HH:MM' 자동제출, null=OFF
  members: Array<{ id: number; name: string }>;
}

export async function listGroupsWithMembers(): Promise<GroupWithMembers[]> {
  const groups = await query<{ id: number; name: string; leader_id: number | null; leader_name: string | null; is_ai_group: boolean; write_start: string; write_end: string; submit_due: string | null }>(
    `SELECT g.id, g.name, g.leader_user_id AS leader_id, l.name AS leader_name,
            g.is_ai_group,
            to_char(g.write_start,'HH24:MI') AS write_start,
            to_char(g.write_end,'HH24:MI') AS write_end,
            to_char(g.submit_due,'HH24:MI') AS submit_due
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
  if (input.loginCode != null && !/^\d{4}$/.test(input.loginCode)) throw new Error("INVALID_CODE");
  if (!isValidEmail(input.email)) throw new Error("INVALID_EMAIL");
  return tx(async (c) => {
    const dup = (await c.query<{ id: number }>(`SELECT id FROM users WHERE lower(login_id)=lower($1)`, [input.loginId])).rows[0];
    if (dup) throw new Error("DUPLICATE_LOGIN_ID");
    const newId = (
      await c.query<{ id: number }>(
        `INSERT INTO users(login_id, name, email, role, group_id, login_code)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [input.loginId, input.name, input.email, input.role, input.groupId, input.loginCode ?? "1234"],
      )
    ).rows[0].id;
    // 그룹장 역할 + 소속 그룹이면, 그 그룹에 활성 그룹장이 없을 때 이 사용자를 그룹장(leader_user_id)으로 지정.
    // (기존 활성 그룹장 무단 교체는 하지 않음 — 교체는 '그룹 관리 > 그룹장 변경'에서)
    if (input.role === "group_leader" && input.groupId != null) {
      await c.query(
        `UPDATE groups g SET leader_user_id = $1
           WHERE g.id = $2
             AND (g.leader_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users lu WHERE lu.id = g.leader_user_id AND lu.active))`,
        [newId, input.groupId],
      );
    }
    return { id: newId };
  });
}

export async function listGroupOptions(): Promise<Array<{ id: number; name: string }>> {
  return query<{ id: number; name: string }>(`SELECT id, name FROM groups ORDER BY id`);
}

// ===== 그룹 관리(생성/수정/삭제 + 구성원) =====

/** 그룹 시간정책 입력(작성창·자동제출·AI그룹). 'HH:MM' 문자열. submitDue 빈값/null = 자동제출 OFF. */
export interface GroupPolicyInput {
  isAi?: boolean;
  writeStart?: string | null;
  writeEnd?: string | null;
  submitDue?: string | null;
}

/** 그룹 생성. 이름은 중복 불가(대소문자 무시). AI그룹 토글·시간정책 포함. */
export async function createGroup(input: { name: string; leaderId?: number | null } & GroupPolicyInput): Promise<{ id: number }> {
  const name = input.name.trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const dup = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE lower(name)=lower($1)`, [name]);
  if (dup) throw new Error("DUPLICATE_NAME");
  const r = await queryOne<{ id: number }>(
    `INSERT INTO groups(name, leader_user_id, is_ai_group, write_start, write_end, submit_due)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [name, input.leaderId ?? null, !!input.isAi, input.writeStart || "00:00", input.writeEnd || "23:59", input.submitDue || null],
  );
  return { id: r!.id };
}

/**
 * 그룹 정보 수정(이름·그룹장·시간정책). 그룹장은 활성 사용자면 누구나(구성원 아니어도). 미지정 허용.
 * 반환 policyChanged=true면 시간정책(AI토글/작성창/자동제출)이 실제로 바뀐 것 → 호출부가 그룹원 메일 발송.
 */
export async function updateGroup(
  id: number,
  input: { name: string; leaderId: number | null } & GroupPolicyInput,
): Promise<{ policyChanged: boolean; window: { isAi: boolean; writeStart: string; writeEnd: string; submitDue: string | null } }> {
  const name = input.name.trim();
  if (!name) throw new Error("NAME_REQUIRED");
  const cur = await queryOne<{ id: number; is_ai_group: boolean; write_start: string; write_end: string; submit_due: string | null }>(
    `SELECT id, is_ai_group,
            to_char(write_start,'HH24:MI') AS write_start, to_char(write_end,'HH24:MI') AS write_end,
            to_char(submit_due,'HH24:MI') AS submit_due
       FROM groups WHERE id=$1`,
    [id],
  );
  if (!cur) throw new Error("NOT_FOUND");
  const dup = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE lower(name)=lower($1) AND id<>$2`, [name, id]);
  if (dup) throw new Error("DUPLICATE_NAME");
  // 그룹장은 활성 사용자면 누구나 지정 가능(구성원 아니어도). 한 사람이 여러 그룹의 그룹장을 맡을 수 있음.
  if (input.leaderId != null) {
    const m = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id=$1 AND active`, [input.leaderId]);
    if (!m) throw new Error("LEADER_NOT_ACTIVE");
  }
  // 미지정 필드는 기존값 유지(부분 수정). submitDue는 빈문자/undefined 구분: undefined=유지, ''=OFF로 해제.
  const isAi = input.isAi ?? cur.is_ai_group;
  const writeStart = input.writeStart || cur.write_start;
  const writeEnd = input.writeEnd || cur.write_end;
  const submitDue = input.submitDue === undefined ? cur.submit_due : input.submitDue || null;
  await query(
    `UPDATE groups SET name=$2, leader_user_id=$3, is_ai_group=$4, write_start=$5, write_end=$6, submit_due=$7 WHERE id=$1`,
    [id, name, input.leaderId, isAi, writeStart, writeEnd, submitDue],
  );
  const policyChanged =
    isAi !== cur.is_ai_group ||
    writeStart !== cur.write_start ||
    writeEnd !== cur.write_end ||
    (submitDue ?? null) !== (cur.submit_due ?? null);
  return { policyChanged, window: { isAi, writeStart, writeEnd, submitDue: submitDue ?? null } };
}

/** 그룹 삭제. 구성원의 group_id와 그룹장 FK는 ON DELETE SET NULL로 자동 해제. */
export async function deleteGroup(id: number): Promise<void> {
  const cur = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE id=$1`, [id]);
  if (!cur) throw new Error("NOT_FOUND");
  await query(`DELETE FROM groups WHERE id=$1`, [id]);
}

/** 구성원 추가(소속 이동). 그룹장직은 소속과 독립 — 다른 그룹의 그룹장직은 건드리지 않음(복수 그룹장 지원). */
export async function addGroupMember(groupId: number, userId: number): Promise<void> {
  const g = await queryOne<{ id: number }>(`SELECT id FROM groups WHERE id=$1`, [groupId]);
  if (!g) throw new Error("GROUP_NOT_FOUND");
  const u = await queryOne<{ id: number }>(`SELECT id FROM users WHERE id=$1`, [userId]);
  if (!u) throw new Error("USER_NOT_FOUND");
  await query(`UPDATE users SET group_id=$2 WHERE id=$1`, [userId, groupId]);
}

/** 구성원 제거. 그룹장이었다면 그룹장직도 함께 해제. */
export async function removeGroupMember(groupId: number, userId: number): Promise<void> {
  await query(`UPDATE groups SET leader_user_id=NULL WHERE id=$1 AND leader_user_id=$2`, [groupId, userId]);
  await query(`UPDATE users SET group_id=NULL WHERE id=$1 AND group_id=$2`, [userId, groupId]);
}

export interface UpdateUserInput {
  name: string;
  role: "employee" | "group_leader" | "admin";
  groupId: number | null;
  active: boolean;
  /** 보고서 작성 대상 여부. 미지정(undefined)이면 기존 값 유지(부분 수정 호환). */
  reportRequired?: boolean;
  /** 로그인 인증번호(4자리). 미지정(undefined)이면 기존 값 유지. */
  loginCode?: string;
  /** 이메일. 미지정(undefined)이면 기존 값 유지. 지정 시 유효 형식이어야 함. */
  email?: string;
}

/** 사용자 수정(이름/역할/소속/활성/작성대상/인증번호/이메일). 비활성 전환 시 해당 사용자 세션 일괄 폐기(권한 누수창 차단). */
export async function updateUser(id: number, input: UpdateUserInput): Promise<void> {
  if (!input.name.trim()) throw new Error("NAME_REQUIRED");
  if (input.loginCode != null && !/^\d{4}$/.test(input.loginCode)) throw new Error("INVALID_CODE");
  if (input.email != null && !isValidEmail(input.email)) throw new Error("INVALID_EMAIL");
  await tx(async (c) => {
    const cur = (await c.query<{ active: boolean }>(`SELECT active FROM users WHERE id=$1`, [id])).rows[0];
    if (!cur) throw new Error("NOT_FOUND");
    await c.query(
      `UPDATE users SET name=$2, role=$3, group_id=$4, active=$5, report_required=COALESCE($6, report_required), login_code=COALESCE($7, login_code), email=COALESCE($8, email) WHERE id=$1`,
      [id, input.name.trim(), input.role, input.groupId, input.active, input.reportRequired ?? null, input.loginCode ?? null, input.email?.trim() ?? null],
    );

    // 그룹장 실체(groups.leader_user_id) 동기화 — 그룹장직은 소속과 독립(복수 그룹장 지원).
    // 다른 그룹의 그룹장직은 건드리지 않는다. 단:
    if (input.role === "employee") {
      // 직원으로 강등되면 어느 그룹도 이끌 수 없음 → 맡고 있던 그룹장직 전부 해제
      await c.query(`UPDATE groups SET leader_user_id=NULL WHERE leader_user_id=$1`, [id]);
    } else if (input.role === "group_leader" && input.groupId != null) {
      // 그룹장이면 자기 소속 그룹에 활성 그룹장이 없을 때만 본인을 지정(편의 — 추가 그룹은 '그룹 관리'에서)
      await c.query(
        `UPDATE groups g SET leader_user_id = $1
           WHERE g.id = $2
             AND (g.leader_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM users lu WHERE lu.id = g.leader_user_id AND lu.active))`,
        [id, input.groupId],
      );
    }

    if (cur.active && !input.active) {
      await c.query(`DELETE FROM sessions WHERE user_id=$1`, [id]); // 비활성화 즉시 로그아웃
    }
  });
}
