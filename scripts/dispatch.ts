import "./_loadenv";
import { Client } from "pg";
import { mailer } from "../src/lib/mail";
import { reportInviteEmail } from "../src/lib/mail/templates";
import { isV2Date } from "../src/lib/domain/config";

// 정해진 시점에 활성 사용자에게 보고 작성 안내 메일 발송 + 당일 보고서 보장.
// 사용: tsx scripts/dispatch.ts <plan_invite|morning_close|afternoon_close|night_close|reminder|submit_nag>
// (선택) 2번째 인자로 특정 이메일만 발송(테스트): tsx scripts/dispatch.ts plan_invite someone@x.com
//
// submit_nag(미제출 독촉): 20:00 이후, '야간 업무 없음'인데 아직 제출하지 않은 사용자에게만 발송.
//   cron이 5분 간격으로 호출하며, 사용자당 당일 최대 30회까지(이미 30회면 스킵). 제출/야간있음이면 제외.

type Kind = "plan_invite" | "morning_close" | "afternoon_close" | "night_close" | "reminder" | "submit_nag";
const VALID: Kind[] = ["plan_invite", "morning_close", "afternoon_close", "night_close", "reminder", "submit_nag"];

const SUBMITTED = ["검수대기", "승인", "제출완료", "재제출"]; // 제출 완료 → 독촉 제외
const MAX_NAG = 30; // 미제출 독촉 최대 횟수(사용자/일)

function todayKstISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function kstHour(): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", hour: "2-digit", hour12: false }).format(new Date()),
  );
}

async function main() {
  const kind = process.argv[2] as Kind;
  const onlyEmail = process.argv[3];
  if (!VALID.includes(kind)) throw new Error(`kind must be one of ${VALID.join("|")}`);

  // 미제출 독촉은 20:00 이후에만(특정 이메일 테스트 발송은 시간 무시).
  if (kind === "submit_nag" && !onlyEmail && kstHour() < 20) {
    console.log(`[dispatch:submit_nag] 20:00 이전(${kstHour()}시) — 발송 안 함`);
    return;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString });
  await c.connect();
  const today = todayKstISO();
  const link = (process.env.APP_BASE_URL ?? "http://localhost:3000") + "/login";

  // 보고서 작성 대상(report_required)만 — 비대상자는 작성요청·마감안내·독촉 모두 제외.
  const where = onlyEmail
    ? "active AND COALESCE(report_required,true) AND lower(email)=lower($1)"
    : "active AND COALESCE(report_required,true)";
  const params = onlyEmail ? [onlyEmail] : [];
  const users = (
    await c.query<{ id: number; name: string; email: string }>(
      `SELECT id, name, email FROM users WHERE ${where} ORDER BY id`,
      params,
    )
  ).rows;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const u of users) {
    // 당일 보고서 보장
    const ex = await c.query<{ id: number; status: string; night_has: boolean }>(
      `SELECT id, status::text AS status, COALESCE(night_has,false) AS night_has FROM daily_reports WHERE user_id=$1 AND report_date=$2`,
      [u.id, today],
    );
    const rep = ex.rows[0];

    // 미제출 독촉: 이미 제출했거나(검수대기/승인/제출완료/재제출) 야간 업무가 있으면 제외
    if (kind === "submit_nag" && rep && (SUBMITTED.includes(rep.status) || rep.night_has)) {
      skipped++;
      continue;
    }

    let rid = rep?.id;
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

    // 미제출 독촉: 당일 최대 30회까지(이미 30회 보냈으면 스킵)
    if (kind === "submit_nag") {
      const n = (
        await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM notifications WHERE report_id=$1 AND kind='submit_nag'`,
          [rid],
        )
      ).rows[0].n;
      if (n >= MAX_NAG) {
        skipped++;
        continue;
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
  console.log(`[dispatch:${kind}] ${today} — sent=${sent} failed=${failed} skipped=${skipped} (transport=${mailer().name})`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
