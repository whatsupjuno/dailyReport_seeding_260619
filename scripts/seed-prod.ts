import "./_loadenv";
import { Client } from "pg";

// 운영 시드: 실제 조직(Sales). 멱등(upsert) — 기존 데이터 보존, truncate 없음.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString });
  await c.connect();
  try {
    await c.query("BEGIN");

    await c.query(`INSERT INTO groups(name) VALUES ('Sales') ON CONFLICT (name) DO NOTHING`);
    const gid = (await c.query<{ id: number }>(`SELECT id FROM groups WHERE name='Sales'`)).rows[0].id;

    // [login_id(=email), name, code, role]
    // 방준호: Sales 리더이자 운영 관리자 → role=admin (관리 메뉴 + 전체 검수). Sales group leader로도 유지.
    const users: Array<[string, string, string, "employee" | "group_leader" | "admin"]> = [
      ["juno@wavle.io", "방준호", "5660", "admin"],
      ["jb@wavle.io", "박정빈", "7815", "employee"],
      ["jhkang@wavle.io", "강진현", "4942", "employee"],
    ];
    for (const [login, name, code, role] of users) {
      await c.query(
        `INSERT INTO users(login_id, name, email, role, group_id, login_code, active)
         VALUES ($1,$2,$3,$4,$5,$6,true)
         ON CONFLICT (login_id) DO UPDATE SET
           name=EXCLUDED.name, email=EXCLUDED.email, role=EXCLUDED.role,
           group_id=EXCLUDED.group_id, login_code=EXCLUDED.login_code, active=true`,
        [login, name, login, role, gid, code],
      );
    }
    await c.query(
      `UPDATE groups SET leader_user_id=(SELECT id FROM users WHERE login_id='juno@wavle.io') WHERE id=$1`,
      [gid],
    );

    await c.query("COMMIT");
    console.log("[seed-prod] done. Sales group + 3 users upserted.");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
