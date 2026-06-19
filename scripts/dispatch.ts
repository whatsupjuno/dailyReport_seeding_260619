import "./_loadenv";
import { Client } from "pg";
import { mailer } from "../src/lib/mail";
import { reportInviteEmail } from "../src/lib/mail/templates";
import { isV2Date } from "../src/lib/domain/config";

// 정해진 시점에 활성 사용자에게 보고 작성 안내 메일 발송 + 당일 보고서 보장.
// 사용: tsx scripts/dispatch.ts <plan_invite|morning_close|afternoon_close|night_close|reminder>
// (선택) 2번째 인자로 특정 이메일만 발송(테스트): tsx scripts/dispatch.ts plan_invite someone@x.com

type Kind = "plan_invite" | "morning_close" | "afternoon_close" | "night_close" | "reminder";
const VALID: Kind[] = ["plan_invite", "morning_close", "afternoon_close", "night_close", "reminder"];

function todayKstISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const kind = process.argv[2] as Kind;
  const onlyEmail = process.argv[3];
  if (!VALID.includes(kind)) throw new Error(`kind must be one of ${VALID.join("|")}`);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString });
  await c.connect();
  const today = todayKstISO();
  const link = (process.env.APP_BASE_URL ?? "http://localhost:3000") + "/login";

  const where = onlyEmail ? "active AND lower(email)=lower($1)" : "active";
  const params = onlyEmail ? [onlyEmail] : [];
  const users = (
    await c.query<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE ${where} ORDER BY id`,
      params,
    )
  ).rows;

  let sent = 0;
  let failed = 0;
  for (const u of users) {
    // 당일 보고서 보장
    const ex = await c.query<{ id: number }>(
      `SELECT id FROM daily_reports WHERE user_id=$1 AND report_date=$2`,
      [u.id, today],
    );
    let rid = ex.rows[0]?.id;
    if (!rid) {
      // getOrCreateReport와 동일 규칙: v2면 model_version=2 + plan 섹션 미생성(미설정 시 v2 동결되어 작성 불가).
      const v2 = isV2Date(today);
      rid = (
        await c.query<{ id: number }>(
          `INSERT INTO daily_reports(user_id, report_date, status, model_version) VALUES ($1,$2,'작성중',$3) RETURNING id`,
          [u.id, today, v2 ? 2 : 1],
        )
      ).rows[0].id;
      if (!v2) {
        await c.query(`INSERT INTO report_sections(report_id, kind, status) VALUES ($1,'plan','작성중')`, [
          rid,
        ]);
      }
    }

    const msg = reportInviteEmail(u.email, u.name, kind, link);
    const res = await mailer().send(msg);
    await c.query(
      `INSERT INTO notifications(user_id, report_id, kind, subject, status, provider_id, sent_at, error)
       VALUES ($1,$2,$3,$4,$5,$6,now(),$7)`,
      [u.id, rid, kind, msg.subject, res.ok ? "sent" : "failed", res.id || null, res.error ?? null],
    );
    if (res.ok) sent++;
    else failed++;
    console.log(`${res.ok ? "OK  " : "FAIL"} ${u.email}${res.error ? " :: " + res.error : ""}`);
  }
  console.log(`[dispatch:${kind}] ${today} — sent=${sent} failed=${failed} (transport=${mailer().name})`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
