import "./_loadenv";
import { Client } from "pg";
import { mailer } from "../src/lib/mail";
import { reportInviteEmail } from "../src/lib/mail/templates";
import { isV2Date } from "../src/lib/domain/config";
import { autoSubmitReport } from "../src/lib/data/report-mutations";
import { isWeekdayKst } from "../src/lib/date";

// 정해진 시점에 활성 사용자에게 보고 작성 안내 메일 발송 + 당일 보고서 보장.
// 사용: tsx scripts/dispatch.ts <plan_invite|morning_close|afternoon_close|night_close|reminder|submit_nag>
// (선택) 2번째 인자로 특정 이메일만 발송(테스트): tsx scripts/dispatch.ts plan_invite someone@x.com
//
// submit_nag(미제출 독촉): 20:00 이후, '야간 업무 없음'인데 아직 제출하지 않은 사용자에게만 발송.
//   cron이 5분 간격으로 호출하며, 사용자당 당일 최대 30회까지(이미 30회면 스킵). 제출/야간있음이면 제외.

type Kind = "plan_invite" | "plan_invite_tick" | "morning_close" | "afternoon_close" | "night_close" | "reminder" | "submit_nag" | "auto_submit";
const VALID: Kind[] = ["plan_invite", "plan_invite_tick", "morning_close", "afternoon_close", "night_close", "reminder", "submit_nag", "auto_submit"];

// 그룹 슬러그 → groups.name. 정확한 그룹명을 직접 넘겨도 됨.
const GROUP_BY_SLUG: Record<string, string> = { sales: "Sales", pd: "Product Design", ai: "AI Agent" };

/** KST 날짜(YYYY-MM-DD), days 오프셋. */
function kstDateOffset(days: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(Date.now() + days * 86_400_000),
  );
}

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

/** 현재 KST '하루 중 분'(0~1439). 그룹별 invite_at 도래 판정용. */
function kstMinuteOfDay(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, m] = parts.split(":").map(Number);
  return h * 60 + m;
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

  // ── 자동제출(그룹별 마감) ── 이메일 발송 없음. argv[3]=그룹 슬러그(sales|pd|ai) 또는 정확한 그룹명.
  if (kind === "auto_submit") {
    const slug = (process.argv[3] ?? "").toLowerCase();
    const groupName = GROUP_BY_SLUG[slug] ?? process.argv[3];
    if (!groupName) throw new Error("auto_submit는 그룹 인자 필요: sales|pd|ai|<그룹명>");
    const g = (await c.query<{ id: number; is_ai_group: boolean; submit_due: string | null }>(`SELECT id, is_ai_group, submit_due FROM groups WHERE name=$1`, [groupName])).rows[0];
    if (!g) { console.log(`[auto_submit] 그룹 없음: ${groupName}`); await c.end(); return; }
    // 자동제출 OFF(submit_due NULL)면 cron 줄이 남아 있어도 발송 안 함(정책 단일 진실원천 = groups.submit_due).
    if (g.submit_due == null) { console.log(`[auto_submit:${groupName}] 자동제출 OFF(submit_due 없음) — 스킵`); await c.end(); return; }
    // AI는 09:00에 '어제 시작분' 윈도우(전날 09:00~당일 08:59)를 닫음 — 09:00 이전 호출은 아직 진행 중인 윈도우라 방어.
    if (g.is_ai_group && kstHour() < 9) { console.log(`[auto_submit:${groupName}] 09:00 이전(${kstHour()}시) — 스킵`); await c.end(); return; }
    // 비-AI는 오늘분(평일만, 주말 방어).
    const targetDate = g.is_ai_group ? kstDateOffset(-1) : kstDateOffset(0);
    if (!g.is_ai_group && !isWeekdayKst(targetDate)) {
      console.log(`[auto_submit:${groupName}] ${targetDate} 주말 — 스킵`);
      await c.end();
      return;
    }
    const targets = (
      await c.query<{ id: number }>(
        `SELECT dr.id FROM daily_reports dr JOIN users u ON u.id=dr.user_id
          WHERE u.group_id=$1 AND dr.report_date=$2 AND dr.status::text IN ('작성중','계획제출')`,
        [g.id, targetDate],
      )
    ).rows;
    let submitted = 0;
    let skipped = 0;
    let held = 0;
    for (const t of targets) {
      // AI 그룹은 종합본(AI Context 종합) 미첨부면 제출 보류 → 작성중 유지(제출 후 락으로 종합본 유실 방지).
      const r = await autoSubmitReport(t.id, { requireAiHandoff: g.is_ai_group });
      if (r.done) submitted++;
      else if (r.held) held++;
      else skipped++;
    }
    console.log(`[auto_submit:${groupName}] ${targetDate} submitted=${submitted} held=${held} skipped=${skipped}`);
    if (held > 0)
      console.warn(`[auto_submit:${groupName}] ⚠ ${held}건 종합본 미첨부로 제출 보류(작성중 유지) — 자동화 마감 미완료, 첨부/백필 후 제출 필요`);
    await c.end();
    return;
  }

  // ── 작성 요청 메일 폴링(plan_invite_tick) ── cron이 매 N분 호출. 그룹 invite_at가 당일 도래했고 아직 미발송인 작성대상에게 발송.
  // invite_at은 스냅샷하지 않고 매 틱마다 그룹 '현재값'을 live로 평가 → 발송 시각 변경 시:
  //   · 오늘 아직 미발송이면(시각 변경 시점에 미발송) 새 시각 기준으로 그날 바로 적용,
  //   · 오늘 이미 발송했으면 report별 plan_invite 멱등으로 오늘은 재발송 안 하고 다음 날부터 새 시각 적용.
  if (kind === "plan_invite_tick") {
    const today = todayKstISO();
    const link = (process.env.APP_BASE_URL ?? "http://localhost:3000") + "/login";
    const nowMin = kstMinuteOfDay();
    const weekday = isWeekdayKst(today);
    const groups = (
      await c.query<{ id: number; name: string; is_ai_group: boolean; invite_min: number }>(
        `SELECT id, name, is_ai_group,
                (EXTRACT(HOUR FROM invite_at)*60 + EXTRACT(MINUTE FROM invite_at))::int AS invite_min
           FROM groups WHERE invite_at IS NOT NULL ORDER BY id`,
      )
    ).rows;
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (const g of groups) {
      if (nowMin < Number(g.invite_min)) continue; // 아직 발송 시각 전
      if (!g.is_ai_group && !weekday) continue; // 비-AI 그룹은 평일만
      const users = (
        await c.query<{ id: number; name: string; email: string }>(
          `SELECT id, name, email FROM users WHERE group_id=$1 AND active AND COALESCE(report_required,true) ORDER BY id`,
          [g.id],
        )
      ).rows;
      for (const u of users) {
        let rid = (await c.query<{ id: number }>(`SELECT id FROM daily_reports WHERE user_id=$1 AND report_date=$2`, [u.id, today])).rows[0]?.id;
        if (!rid) {
          const v2 = isV2Date(today);
          rid = (
            await c.query<{ id: number }>(
              `INSERT INTO daily_reports(user_id, report_date, status, model_version,
                 win_snapshotted, win_is_ai, win_write_start, win_write_end, win_submit_due)
               SELECT $1,$2,'작성중',$3, true,
                      COALESCE(gx.is_ai_group,false), COALESCE(gx.write_start,'00:00'), COALESCE(gx.write_end,'23:59'), gx.submit_due
                 FROM users ux LEFT JOIN groups gx ON gx.id=ux.group_id WHERE ux.id=$1 RETURNING id`,
              [u.id, today, v2 ? 2 : 1],
            )
          ).rows[0].id;
          if (!v2) await c.query(`INSERT INTO report_sections(report_id, kind, status) VALUES ($1,'plan','작성중')`, [rid]);
        }
        // 오늘 이미 작성요청 발송했으면 스킵(report별 1회 — sent/failed 무관하게 멱등)
        if ((await c.query(`SELECT 1 FROM notifications WHERE report_id=$1 AND kind='plan_invite'`, [rid])).rows[0]) {
          skipped++;
          continue;
        }
        const msg = reportInviteEmail(u.email, u.name, "plan_invite", link);
        const res = await mailer().send(msg);
        await c.query(
          `INSERT INTO notifications(user_id, report_id, kind, subject, status, provider_id, sent_at, error)
           VALUES ($1,$2,'plan_invite',$3,$4,$5,now(),$6)`,
          [u.id, rid, msg.subject, res.ok ? "sent" : "failed", res.id || null, res.error ?? null],
        );
        if (res.ok) sent++;
        else failed++;
        console.log(`${res.ok ? "OK  " : "FAIL"} [invite:${g.name}] ${u.email}${res.error ? " :: " + res.error : ""}`);
      }
    }
    console.log(`[plan_invite_tick] ${today} ${nowMin}분 — sent=${sent} failed=${failed} skipped=${skipped} (transport=${mailer().name})`);
    await c.end();
    return;
  }

  const today = todayKstISO();
  const link = (process.env.APP_BASE_URL ?? "http://localhost:3000") + "/login";

  // 보고서 작성 대상(report_required)만 — 비대상자는 작성요청·마감안내·독촉 모두 제외.
  // AI 그룹은 자체 09:00 슬롯·API로 자기관리 → 전사 이메일/보고서보장에서 제외(테스트 onlyEmail은 제외 안 함).
  const notAi = "COALESCE((SELECT g.is_ai_group FROM groups g WHERE g.id = users.group_id), false) = false";
  const where = onlyEmail
    ? "active AND COALESCE(report_required,true) AND lower(email)=lower($1)"
    : `active AND COALESCE(report_required,true) AND ${notAi}`;
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
      // getOrCreateReport와 동일하게 그룹 정책 스냅샷(win_*)도 함께 채움.
      rid = (
        await c.query<{ id: number }>(
          `INSERT INTO daily_reports(user_id, report_date, status, model_version,
             win_snapshotted, win_is_ai, win_write_start, win_write_end, win_submit_due)
           SELECT $1,$2,'작성중',$3, true,
                  COALESCE(g.is_ai_group,false), COALESCE(g.write_start,'00:00'), COALESCE(g.write_end,'23:59'), g.submit_due
             FROM users u LEFT JOIN groups g ON g.id=u.group_id WHERE u.id=$1
           RETURNING id`,
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
