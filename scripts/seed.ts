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
function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

interface V2Task {
  project?: string;
  title: string;
  status: "계획" | "진행중" | "완결" | "지연";
  doneTime?: string; // 'HH:MM' KST — 완결/지연이면 필수
  isNight?: boolean;
  hold?: string;
  plannedStart?: string;
  plannedMin?: number;
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL not set");
  const c = new Client({ connectionString });
  await c.connect();
  const today = todayKstISO();
  const yesterday = addDays(today, -1);

  try {
    await c.query("BEGIN");
    await c.query(`TRUNCATE
      task_comments, comment_reads, task_rejections,
      task_attachments, tasks, report_sections, communication_attachments, communications,
      report_events, qualitative_metrics, notifications, daily_reports,
      auth_otps, sessions, users, groups RESTART IDENTITY CASCADE`);

    const groups = ["개발팀", "마케팅팀", "디자인팀", "영업팀", "운영"];
    const gid: Record<string, number> = {};
    for (const name of groups) {
      const r = await c.query<{ id: number }>(`INSERT INTO groups(name) VALUES ($1) RETURNING id`, [name]);
      gid[name] = r.rows[0].id;
    }

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

    const leaders: [string, string][] = [
      ["개발팀", "kim.doyun"],
      ["마케팅팀", "kim.jiwon"],
      ["디자인팀", "lee.haneul"],
      ["영업팀", "choi.minho"],
    ];
    for (const [group, login] of leaders) {
      await c.query(`UPDATE groups SET leader_user_id = $1 WHERE id = $2`, [uid[login], gid[group]]);
    }

    // ===== v2 단일목록 보고서 =====
    async function makeV2(opts: {
      login: string;
      status: string;
      date?: string;
      submitted?: boolean;
      planSubmitted?: boolean;
      dailyComment?: string;
      nightHas?: boolean;
      nightReason?: string;
      isVacation?: boolean;
      vacationType?: string;
      vacationComment?: string;
      tasks?: V2Task[];
      comms?: Array<{ type: string; counterpart: string; at: string; summary: string }>;
      events?: Array<{ kind: string; actor?: string; comment?: string; target?: string }>;
    }): Promise<{ reportId: number; taskIds: number[] }> {
      const date = opts.date ?? today;
      const r = await c.query<{ id: number }>(
        `INSERT INTO daily_reports(user_id, report_date, status, model_version, submitted_at, plan_submitted_at,
                                   daily_comment, night_has, night_reason, is_vacation, vacation_type, vacation_comment)
         VALUES ($1,$2,$3,2,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
        [
          uid[opts.login], date, opts.status,
          opts.submitted ? new Date() : null,
          opts.planSubmitted || opts.submitted ? new Date() : null,
          opts.dailyComment ?? null,
          !!opts.nightHas, opts.nightReason ?? null,
          !!opts.isVacation, opts.vacationType ?? null, opts.vacationComment ?? null,
        ],
      );
      const reportId = r.rows[0].id;
      const taskIds: number[] = [];
      let order = 0;
      for (const t of opts.tasks ?? []) {
        const isNight = t.isNight ?? (!!t.doneTime && parseInt(t.doneTime.split(":")[0], 10) >= 20);
        const tr = await c.query<{ id: number }>(
          `INSERT INTO tasks(report_id, section_id, project, title, status, planned_start, planned_duration_min,
                             hold_reason, sort_order, is_night, completed_at)
           VALUES ($1,NULL,$2,$3,$4,$5,$6,$7,$8,$9,
                   CASE WHEN $10::text IS NOT NULL THEN ($11::date + $10::time) AT TIME ZONE 'Asia/Seoul' ELSE NULL END)
           RETURNING id`,
          [reportId, t.project ?? null, t.title, t.status, t.plannedStart ?? null, t.plannedMin ?? null,
           t.hold ?? null, order++, isNight, t.doneTime ?? null, date],
        );
        taskIds.push(tr.rows[0].id);
      }
      for (const cm of opts.comms ?? []) {
        await c.query(
          `INSERT INTO communications(report_id, comm_type, counterpart, occurred_at, summary) VALUES ($1,$2,$3,$4,$5)`,
          [reportId, cm.type, cm.counterpart, cm.at, cm.summary],
        );
      }
      for (const ev of opts.events ?? []) {
        await c.query(
          `INSERT INTO report_events(report_id, kind, actor_user_id, comment, reject_target) VALUES ($1,$2,$3,$4,$5)`,
          [reportId, ev.kind, ev.actor ? uid[ev.actor] : null, ev.comment ?? null, ev.target ?? null],
        );
      }
      return { reportId, taskIds };
    }

    async function addCommentSeed(taskId: number, reportId: number, login: string, role: string, body: string) {
      await c.query(
        `INSERT INTO task_comments(task_id, report_id, author_user_id, author_role, body) VALUES ($1,$2,$3,$4,$5)`,
        [taskId, reportId, uid[login], role, body],
      );
    }
    async function addRowReject(taskId: number, reportId: number, by: string, comment: string) {
      await c.query(
        `INSERT INTO task_rejections(task_id, report_id, comment, rejected_by) VALUES ($1,$2,$3,$4)`,
        [taskId, reportId, comment, uid[by]],
      );
      await c.query(`UPDATE tasks SET reject_state='반려', rejected_at=now() WHERE id=$1`, [taskId]);
    }

    // 1) 정유나 — 검수대기(v2) + 댓글 2건 + 미읽음(그룹장 마지막 댓글)
    const yuna = await makeV2({
      login: "jung.yuna",
      status: "검수대기",
      submitted: true,
      dailyComment: "오전 환불 API 연동 완료, 정산 배치는 권한 대기로 지연. 내일 오전 우선 처리.",
      tasks: [
        { project: "결제 시스템", title: "결제 모듈 환불 API 연동", status: "완결", doneTime: "09:40", plannedMin: 120 },
        { project: "정산 배치", title: "정산 배치 오류 로그 분석", status: "지연", doneTime: "11:20", hold: "로그 수집 권한 대기" },
        { project: "결제 시스템", title: "환불 정책 변경분 QA 시나리오 작성", status: "완결", doneTime: "14:30" },
        { title: "스프린트 회고 준비 자료 정리", status: "진행중" },
      ],
      comms: [
        { type: "회의", counterpart: "이서연", at: "14:30", summary: "환불 정책 변경분 공유, 6/20 반영 합의" },
        { type: "메신저", counterpart: "박준호", at: "11:10", summary: "정산 배치 권한 요청 진행 상황 확인" },
        { type: "메일", counterpart: "PG사", at: "16:05", summary: "PG 점검 일정 및 대응 절차 회신" },
      ],
      events: [{ kind: "submitted", actor: "jung.yuna" }],
    });
    await addCommentSeed(yuna.taskIds[0], yuna.reportId, "jung.yuna", "employee", "환불 API는 스테이징 검증까지 마쳤습니다. 운영 반영은 6/20 예정입니다.");
    await addCommentSeed(yuna.taskIds[0], yuna.reportId, "kim.doyun", "group_leader", "수고했어요. 운영 반영 전에 롤백 절차도 한 번 점검 부탁드려요.");

    // 2) 박서준 — 검수대기(v2) + 개별(행) 반려 1건
    const seojun = await makeV2({
      login: "park.seojun",
      status: "검수대기",
      submitted: true,
      dailyComment: "주문 취소 플로우 리팩터 완료, 배포 점검은 내일 진행 예정.",
      tasks: [
        { project: "주문 도메인", title: "주문 취소 플로우 리팩터", status: "완결", doneTime: "10:10", plannedMin: 120 },
        { title: "배포 파이프라인 점검", status: "완결", doneTime: "16:20", plannedMin: 60 },
        { project: "주문 도메인", title: "주문 도메인 통합 테스트 보강", status: "진행중" },
      ],
      events: [{ kind: "submitted", actor: "park.seojun" }],
    });
    await addRowReject(seojun.taskIds[1], seojun.reportId, "kim.doyun", "점검 결과 로그를 첨부해 주세요. 무엇을 확인했는지 근거가 필요합니다.");

    // 3) 김서연 — 계획제출(v2): B2 검수 큐 노출 + 행 단위 검토 확인용 (reviewer kim.jiwon)
    await makeV2({
      login: "kim.seoyeon",
      status: "계획제출",
      planSubmitted: true,
      tasks: [
        { project: "런칭", title: "런칭 보도자료 초안 작성", status: "진행중", plannedStart: "10:00", plannedMin: 120 },
        { project: "런칭", title: "퍼포먼스 광고 예산 리포트", status: "계획", plannedStart: "14:00" },
        { title: "주간 지표 대시보드 업데이트", status: "계획" },
      ],
    });

    // 4) 박지훈 — 휴직(v2) 검수대기 (reviewer choi.minho)
    await makeV2({
      login: "park.jihun",
      status: "검수대기",
      submitted: true,
      isVacation: true,
      vacationType: "휴직",
      vacationComment:
        "개인 사정으로 3개월 휴직을 신청합니다. 진행 중이던 영업 파이프라인은 최민호 팀장님께 인수인계 완료했으며, 관련 문서는 사내 위키에 정리해 두었습니다. 복귀 예정일은 9월 18일입니다.",
      events: [{ kind: "submitted", actor: "park.jihun" }],
    });

    // 5) 오세림 — 어제 보고서(미완료 1건 보유) → 오늘 carryover 소스. 오늘은 보고서 없음(write.spec 신규 생성).
    await makeV2({
      login: "oh.serim",
      status: "승인",
      date: yesterday,
      submitted: true,
      tasks: [
        { project: "리뉴얼", title: "메인 페이지 시안 v2", status: "완결", doneTime: "11:00" },
        { project: "리뉴얼", title: "컴포넌트 토큰 정리", status: "진행중" }, // 미완료 → 이월 대상
      ],
      events: [{ kind: "submitted", actor: "oh.serim" }, { kind: "approved", actor: "lee.haneul" }],
    });

    // 6) v1 레거시 보고서(섹션 모델) — 동결 렌더 회귀. 김서연, 2일 전, 승인.
    {
      const date = addDays(today, -2);
      const r = await c.query<{ id: number }>(
        `INSERT INTO daily_reports(user_id, report_date, status, model_version, submitted_at, daily_comment)
         VALUES ($1,$2,'승인',1,now(),$3) RETURNING id`,
        [uid["kim.seoyeon"], date, "레거시 섹션 모델로 작성된 과거 보고서입니다."],
      );
      const rid = r.rows[0].id;
      const sections: Array<{ kind: string; status: string; tasks: Array<{ project?: string; title: string; status: string; hold?: string }> }> = [
        { kind: "plan", status: "마감완료", tasks: [{ project: "런칭", title: "런칭 일정 점검", status: "완결" }] },
        { kind: "morning", status: "마감완료", tasks: [{ project: "런칭", title: "보도자료 검토", status: "완결" }, { title: "광고 예산 리포트", status: "지연", hold: "데이터팀 수치 확정 대기" }] },
        { kind: "afternoon", status: "마감완료", tasks: [{ title: "회고 자료 정리", status: "완결" }] },
      ];
      for (const s of sections) {
        const sr = await c.query<{ id: number }>(
          `INSERT INTO report_sections(report_id, kind, status, locked, closed_at) VALUES ($1,$2,$3,true,now()) RETURNING id`,
          [rid, s.kind, s.status],
        );
        let order = 0;
        for (const t of s.tasks) {
          // 레거시도 0009 CHECK 충족: 완결/지연이면 completed_at 필요 → 섹션 대표시각
          const repTime = s.kind === "morning" ? "11:00" : s.kind === "afternoon" ? "16:00" : "10:00";
          await c.query(
            `INSERT INTO tasks(report_id, section_id, project, title, status, hold_reason, sort_order, completed_at)
             VALUES ($1,$2,$3,$4,$5::task_status,$6,$7,
               CASE WHEN $5::text IN ('완결','지연') THEN ($8::date + $9::time) AT TIME ZONE 'Asia/Seoul' ELSE NULL END)`,
            [rid, sr.rows[0].id, (t as { project?: string }).project ?? null, t.title, t.status, (t as { hold?: string }).hold ?? null, order++, date, repTime],
          );
        }
      }
      await c.query(`INSERT INTO report_events(report_id, kind, actor_user_id) VALUES ($1,'submitted',$2),($1,'approved',$3)`, [rid, uid["kim.seoyeon"], uid["kim.jiwon"]]);
    }

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
