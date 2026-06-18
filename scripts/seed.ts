import "./_loadenv";
import { Client } from "pg";

function todayKstISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString });
  await c.connect();
  const today = todayKstISO();

  try {
    await c.query("BEGIN");
    await c.query(`TRUNCATE
      task_attachments, tasks, report_sections, communication_attachments, communications,
      report_events, qualitative_metrics, notifications, daily_reports,
      auth_otps, sessions, users, groups RESTART IDENTITY CASCADE`);

    // groups
    const groups = ["개발팀", "마케팅팀", "디자인팀", "영업팀", "운영"];
    const gid: Record<string, number> = {};
    for (const name of groups) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO groups(name) VALUES ($1) RETURNING id`,
        [name],
      );
      gid[name] = r.rows[0].id;
    }

    // users
    type U = [string, string, string, "employee" | "group_leader" | "admin", boolean];
    const users: U[] = [
      ["kim.doyun", "김도윤", "개발팀", "group_leader", true],
      ["park.seojun", "박서준", "개발팀", "employee", true],
      ["jung.yuna", "정유나", "개발팀", "employee", true],
      ["kim.jiwon", "김지원", "마케팅팀", "group_leader", true],
      ["kim.seoyeon", "김서연", "마케팅팀", "employee", true],
      ["han.doyun", "한도윤", "마케팅팀", "employee", false],
      ["lee.haneul", "이하늘", "디자인팀", "group_leader", true],
      ["oh.serim", "오세림", "디자인팀", "employee", true],
      ["choi.minho", "최민호", "영업팀", "group_leader", true],
      ["park.jihun", "박지훈", "영업팀", "employee", true],
      ["park.sora", "박소라", "운영", "admin", true],
    ];
    const uid: Record<string, number> = {};
    for (const [login, name, group, role, active] of users) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO users(login_id, name, email, role, group_id, active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [login, name, `${login}@company.com`, role, gid[group], active],
      );
      uid[login] = r.rows[0].id;
    }

    // group leaders
    const leaders: [string, string][] = [
      ["개발팀", "kim.doyun"],
      ["마케팅팀", "kim.jiwon"],
      ["디자인팀", "lee.haneul"],
      ["영업팀", "choi.minho"],
    ];
    for (const [group, login] of leaders) {
      await c.query(`UPDATE groups SET leader_user_id = $1 WHERE id = $2`, [uid[login], gid[group]]);
    }

    // ---- helper: 보고서 + 섹션 + 업무 생성 ----
    async function makeReport(opts: {
      login: string;
      status: string;
      date?: string;
      submitted?: boolean;
      sections: Array<{
        kind: "plan" | "morning" | "afternoon" | "night";
        status: string;
        locked: boolean;
        tasks: Array<{
          project?: string;
          title: string;
          status: string;
          plannedStart?: string;
          plannedMin?: number;
          actualMin?: number;
          hold?: string;
        }>;
      }>;
      comms?: Array<{ type: string; counterpart: string; at: string; summary: string }>;
      dailyComment?: string;
      events?: Array<{ kind: string; actor?: string; comment?: string; target?: string }>;
    }) {
      const r = await c.query<{ id: number }>(
        `INSERT INTO daily_reports(user_id, report_date, status, submitted_at, daily_comment)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [
          uid[opts.login],
          opts.date ?? today,
          opts.status,
          opts.submitted ? new Date() : null,
          opts.dailyComment ?? null,
        ],
      );
      const reportId = r.rows[0].id;
      for (const sec of opts.sections) {
        const sr = await c.query<{ id: number }>(
          `INSERT INTO report_sections(report_id, kind, status, locked, closed_at)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [reportId, sec.kind, sec.status, sec.locked, sec.locked ? new Date() : null],
        );
        const sectionId = sr.rows[0].id;
        let order = 0;
        for (const t of sec.tasks) {
          await c.query(
            `INSERT INTO tasks(report_id, section_id, project, title, status, planned_start, planned_duration_min, actual_duration_min, hold_reason, sort_order)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              reportId,
              sectionId,
              t.project ?? null,
              t.title,
              t.status,
              t.plannedStart ?? null,
              t.plannedMin ?? null,
              t.actualMin ?? null,
              t.hold ?? null,
              order++,
            ],
          );
        }
      }
      for (const cm of opts.comms ?? []) {
        await c.query(
          `INSERT INTO communications(report_id, comm_type, counterpart, occurred_at, summary)
           VALUES ($1,$2,$3,$4,$5)`,
          [reportId, cm.type, cm.counterpart, cm.at, cm.summary],
        );
      }
      for (const ev of opts.events ?? []) {
        await c.query(
          `INSERT INTO report_events(report_id, kind, actor_user_id, comment, reject_target)
           VALUES ($1,$2,$3,$4,$5)`,
          [reportId, ev.kind, ev.actor ? uid[ev.actor] : null, ev.comment ?? null, ev.target ?? null],
        );
      }
      return reportId;
    }

    // 정유나: 검수대기 (김도윤이 검수) — 디자인 morningTasks/afternoonTasks 계승
    await makeReport({
      login: "jung.yuna",
      status: "검수대기",
      submitted: true,
      dailyComment: "오전 환불 API 연동 완료, 정산 배치는 권한 대기로 지연. 내일 오전 우선 처리.",
      sections: [
        {
          kind: "morning",
          status: "마감완료",
          locked: true,
          tasks: [
            { project: "결제 시스템", title: "결제 모듈 환불 API 연동", status: "완결", plannedMin: 120, actualMin: 150 },
            { project: "정산 배치", title: "정산 배치 오류 로그 분석", status: "지연", hold: "로그 수집 권한 대기" },
            { project: "주문 도메인", title: "코드리뷰 (주문 도메인 PR 3건)", status: "완결", actualMin: 25 },
          ],
        },
        {
          kind: "afternoon",
          status: "마감완료",
          locked: true,
          tasks: [
            { project: "결제 시스템", title: "환불 정책 변경분 QA 시나리오 작성", status: "진행중" },
            { project: "정산 배치", title: "정산 배치 권한 요청 및 재시도", status: "완결" },
            { title: "스프린트 회고 준비 자료 정리", status: "완결" },
          ],
        },
      ],
      comms: [
        { type: "회의", counterpart: "이서연", at: "14:30", summary: "환불 정책 변경분 공유, 6/20 반영 합의" },
        { type: "카톡", counterpart: "박준호", at: "11:10", summary: "정산 배치 권한 요청 진행 상황 확인" },
        { type: "메일", counterpart: "PG사", at: "16:05", summary: "PG 점검 일정 및 대응 절차 회신" },
      ],
      events: [{ kind: "submitted", actor: "jung.yuna" }],
    });

    // 박서준: 검수대기 (개발팀 두 번째 검수 대상 — 승인 e2e용)
    await makeReport({
      login: "park.seojun",
      status: "검수대기",
      submitted: true,
      dailyComment: "주문 취소 플로우 리팩터 완료, 배포 점검은 내일 진행 예정.",
      sections: [
        {
          kind: "morning",
          status: "마감완료",
          locked: true,
          tasks: [
            { project: "주문 도메인", title: "주문 취소 플로우 리팩터", status: "완결", plannedMin: 120, actualMin: 110 },
            { title: "배포 파이프라인 점검", status: "완결", plannedMin: 60, actualMin: 60 },
          ],
        },
        {
          kind: "afternoon",
          status: "마감완료",
          locked: true,
          tasks: [{ project: "주문 도메인", title: "주문 도메인 통합 테스트 보강", status: "진행중" }],
        },
      ],
      events: [{ kind: "submitted", actor: "park.seojun" }],
    });

    // 김서연: 전일 보고서(미완 업무 보유) — carryover(어제 미완료 불러오기) e2e용
    const yd = new Date(today + "T00:00:00Z");
    yd.setUTCDate(yd.getUTCDate() - 1);
    const yesterday = yd.toISOString().slice(0, 10);
    await makeReport({
      login: "kim.seoyeon",
      status: "승인",
      date: yesterday,
      submitted: true,
      sections: [
        {
          kind: "afternoon",
          status: "마감완료",
          locked: true,
          tasks: [
            { project: "런칭", title: "런칭 보도자료 검토", status: "완결", plannedMin: 60, actualMin: 70 },
            { project: "런칭", title: "퍼포먼스 광고 예산 리포트", status: "지연", hold: "데이터팀 수치 확정 대기" },
          ],
        },
      ],
      events: [{ kind: "submitted", actor: "kim.seoyeon" }, { kind: "approved", actor: "kim.jiwon" }],
    });

    await c.query("COMMIT");
    console.log(`[seed] done for ${today}. users=${users.length}, groups=${groups.length}`);
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
