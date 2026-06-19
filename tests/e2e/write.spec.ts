import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// v2 단일목록 작성 (오세림: 오늘 보고서 없음 → 신규 v2 + 어제 미완료 보유)
test.describe.configure({ mode: "serial" });

test("어제 미완료 불러오기 → 업무 추가 → 마감(버킷) → 마감 취소", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "oh.serim");
  await expect(page.getByText("오늘 할 일을 한 번에 적어두세요")).toBeVisible();

  // 어제 미완료(컴포넌트 토큰 정리) 불러오기
  await page.getByTestId("carryover").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "컴포넌트 토큰 정리" })).toBeVisible();

  // 신규 업무 추가
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("로그인 모듈 마무리");
  await page.getByTestId("add-submit").click();
  const row = page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" });
  await expect(row).toBeVisible();

  // 마감 → 결과 버킷으로(✓ 마감 칩)
  await row.getByRole("button", { name: "마감", exact: true }).click();
  const done = page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" });
  await expect(done.getByText(/✓ 마감/)).toBeVisible();

  // 마감 취소 → 다시 할 일
  await done.getByRole("button", { name: "마감 취소" }).click();
  await expect(
    page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" }).getByRole("button", { name: "마감", exact: true }),
  ).toBeVisible();
});

test("계획 제출(1차) → 제출하기(최종) 2단계", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "oh.serim"); // 위 테스트로 업무 보유
  // 1차 계획 제출
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("report-status")).toContainText("계획제출");
  // 2차 최종 제출(모달)
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("submit-modal")).toBeVisible();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
});

test("빈 계획 제출 차단", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await login(page, "kim.jiwon"); // 보고서 없음 → 신규(0건)
  await expect(page.getByTestId("report-status")).toContainText(/작성중|미작성/);
  await page.getByTestId("primary-action").click();
  expect(dialogs.some((m) => m.includes("업무를 1개 이상"))).toBeTruthy();
});
