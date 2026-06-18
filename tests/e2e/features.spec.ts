import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("어제 미완료 불러오기 + URL 첨부", async ({ page }) => {
  await login(page, "kim.seoyeon"); // 오늘 보고서 없음 → morningPlan, 전일 미완 보유
  await expect(page.getByText("오늘 업무 계획을 작성하세요")).toBeVisible();

  // #2 어제 미완료 불러오기
  await page.getByTestId("carryover-plan").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "퍼포먼스 광고 예산 리포트" })).toBeVisible();

  // #1 URL 첨부가 있는 업무 추가
  await page.getByTestId("add-task-plan").click();
  await page.getByTestId("add-title").fill("경쟁사 분석");
  await page.getByTestId("add-url-row").click();
  await page.getByTestId("url-input-0").fill("https://example.com/report");
  await page.getByTestId("add-submit").click();

  const row = page.getByTestId("task-row").filter({ hasText: "경쟁사 분석" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("link")).toBeVisible(); // 🔗 첨부 링크
});

test("최근 업무 자동완성(반복 업무)", async ({ page }) => {
  await login(page, "kim.seoyeon"); // 위 테스트로 최근 업무 존재
  await page.getByTestId("repeat-plan").click();
  await expect(page.getByTestId("recent-suggest")).toBeVisible();
  await page.getByTestId("recent-item").first().click();
  await expect(page.getByTestId("add-title")).not.toHaveValue("");
});

test("목록 상태 탭 필터", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/reports");
  await expect(page.getByTestId("mgr-table")).toBeVisible();
  await page.getByRole("link", { name: /검수대기/ }).click();
  await expect(page).toHaveURL(/tab=pending/);
  await expect(page.getByTestId("mgr-table")).toContainText("정유나");
});

test("검수 큐 이전/다음 네비", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("박서준").click();
  await expect(page.getByTestId("queue-nav")).toContainText("2건 중");
});
