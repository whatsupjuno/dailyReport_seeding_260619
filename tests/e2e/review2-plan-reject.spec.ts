import { test, expect } from "@playwright/test";
import { login } from "./helpers";
import { Client } from "pg";

// review.spec(계획제출 큐 노출 B2)가 김서연 계획제출 상태에 의존 → 이 스펙은 알파벳상 그 뒤에 실행되도록 명명.
// 요청#1 계획 반려 + 요청#2 이벤트 알림(rejected/resubmit_review/approved/review_request self-skip) 검증.

const DB = process.env.TEST_DATABASE_URL ?? "postgresql://seeding:seeding@localhost:5432/seeding_test";
async function notifCount(kind: string, opts: { loginId?: string; status?: string } = {}): Promise<number> {
  const c = new Client({ connectionString: DB });
  await c.connect();
  try {
    const p: unknown[] = [kind];
    let sql = `SELECT count(*)::int AS n FROM notifications n JOIN users u ON u.id=n.user_id WHERE n.kind=$1`;
    if (opts.loginId) { p.push(opts.loginId); sql += ` AND u.login_id=$${p.length}`; }
    if (opts.status) { p.push(opts.status); sql += ` AND n.status=$${p.length}`; }
    const r = await c.query<{ n: number }>(sql, p);
    return r.rows[0].n;
  } finally {
    await c.end();
  }
}

/** 결정성 보장: 해당 사용자의 '오늘' 보고서를 삭제(cascade) → 로그인 시 깨끗한 작성중 재생성. */
async function clearTodayReport(loginId: string): Promise<void> {
  const c = new Client({ connectionString: DB });
  await c.connect();
  try {
    await c.query(
      `DELETE FROM daily_reports WHERE user_id=(SELECT id FROM users WHERE login_id=$1) AND report_date=(now() AT TIME ZONE 'Asia/Seoul')::date`,
      [loginId],
    );
  } finally {
    await c.end();
  }
}

test.describe.configure({ mode: "serial" });
let seoyeonReportId = 0;

test("계획 반려: 그룹장이 계획제출 보고서 반려(≥10자) → 직원 rejected 알림 1건", async ({ page }) => {
  await login(page, "kim.jiwon"); // 마케팅팀 그룹장
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("김서연").click();
  await expect(page).toHaveURL(/\/review\/\d+/);
  seoyeonReportId = Number(page.url().split("/").pop());
  await expect(page.getByTestId("plan-review-bar")).toBeVisible();

  // <10자 → 제출 비활성
  await page.getByTestId("plan-reject-open").click();
  await page.getByTestId("plan-reject-reason").fill("짧은사유");
  await expect(page.getByTestId("plan-reject-submit")).toBeDisabled();

  // ≥10자 → 반려
  await page.getByTestId("plan-reject-reason").fill("계획 범위가 불명확합니다. 14시 이후 일정을 구체화해 주세요.");
  const before = await notifCount("rejected", { loginId: "kim.seoyeon", status: "sent" });
  await page.getByTestId("plan-reject-submit").click();
  await page.waitForURL(/\/review$/);
  expect(await notifCount("rejected", { loginId: "kim.seoyeon", status: "sent" })).toBe(before + 1);
});

test("계획 반려 권한: 비그룹장은 403", async ({ page }) => {
  await login(page, "park.seojun"); // 개발팀 직원(김서연 그룹장 아님)
  const res = await page.request.post(`/api/reviews/${seoyeonReportId}/plan-reject`, { data: { comment: "권한 없는 사용자의 반려 시도입니다." } });
  expect(res.status()).toBe(403);
});

test("작성자: 계획 반려 사유 배너 표시 → 재제출 → 그룹장 resubmit_review 알림", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "kim.seoyeon");
  await expect(page.getByTestId("report-status")).toContainText("반려");
  await expect(page.getByTestId("mode-banner")).toContainText("불명확"); // 그룹장 계획 반려 사유가 작성자에게 전달됨

  const before = await notifCount("resubmit_review", { loginId: "kim.jiwon", status: "sent" });
  await page.getByTestId("primary-action").click();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
  expect(await notifCount("resubmit_review", { loginId: "kim.jiwon", status: "sent" })).toBe(before + 1);
});

test("그룹장 승인 → 직원 approved 알림", async ({ page }) => {
  await login(page, "kim.jiwon");
  await page.goto(`/review/${seoyeonReportId}`);
  const before = await notifCount("approved", { loginId: "kim.seoyeon", status: "sent" });
  await page.getByTestId("approve").click();
  await page.waitForURL(/\/review$/);
  expect(await notifCount("approved", { loginId: "kim.seoyeon", status: "sent" })).toBe(before + 1);
});

test("셀프(본인이 자기 그룹 그룹장): 제출 시 리더 알림은 skipped(자기발송 0)", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await clearTodayReport("kim.doyun"); // 다른 스펙이 남긴 kim.doyun 오늘 보고서 제거 → 결정적 작성중
  await login(page, "kim.doyun"); // 개발팀 그룹장 = 본인. 오늘 보고서 없음 → 작성중 자동 생성
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("셀프 제출 검증 업무");
  await page.getByTestId("add-submit").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "셀프 제출 검증 업무" })).toBeVisible(); // 추가 완료 대기(빈 계획 방지)
  await page.getByTestId("primary-action").click(); // 1차 계획 제출(알림 없음)
  await expect(page.getByTestId("report-status")).toContainText("계획제출");
  const beforeSent = await notifCount("review_request", { loginId: "kim.doyun", status: "sent" });
  const beforeSkip = await notifCount("review_request", { loginId: "kim.doyun", status: "skipped" });
  await page.getByTestId("primary-action").click(); // 2차 최종 제출
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
  // 자기 자신에게는 발송하지 않고 skipped로 기록
  expect(await notifCount("review_request", { loginId: "kim.doyun", status: "sent" })).toBe(beforeSent);
  expect(await notifCount("review_request", { loginId: "kim.doyun", status: "skipped" })).toBe(beforeSkip + 1);
});

test("1차 계획 제출 → 그룹장에게 계획 컨펌요청(plan_review_request) 알림", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await clearTodayReport("kim.seoyeon"); // 마케팅팀(그룹장 kim.jiwon≠본인) — 깨끗한 작성중
  await login(page, "kim.seoyeon");
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("계획제출 알림 검증");
  await page.getByTestId("add-submit").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "계획제출 알림 검증" })).toBeVisible();
  const before = await notifCount("plan_review_request", { loginId: "kim.jiwon", status: "sent" });
  await page.getByTestId("primary-action").click(); // 1차 계획 제출
  await expect(page.getByTestId("report-status")).toContainText("계획제출");
  // 그룹장(kim.jiwon)에게 계획 컨펌요청 1건
  expect(await notifCount("plan_review_request", { loginId: "kim.jiwon", status: "sent" })).toBe(before + 1);
});
