import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("직원 작성 흐름: 계획 추가 → 계획 제출 → 오전 마감 모드", async ({ page }) => {
  await login(page, "oh.serim"); // 오늘 보고서 없음 → morningPlan
  await expect(page.getByText("오늘 업무 계획을 작성하세요")).toBeVisible();

  await page.getByTestId("add-task-plan").click();
  await page.getByTestId("add-title").fill("로그인 모듈 마무리");
  await page.getByTestId("add-submit").click();

  await expect(page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" })).toBeVisible();

  await page.getByTestId("primary-action").click();

  // morningClose로 전이
  await expect(page.getByText("오전 업무를 마감하고 오후 계획을 세워주세요")).toBeVisible();
  await expect(page.getByTestId("section-morning")).toBeVisible();
});

test("오전 마감에서 업무 추가·개별 마감", async ({ page }) => {
  await login(page, "oh.serim"); // 위 테스트로 morningClose 상태
  await expect(page.getByText("오전 업무를 마감")).toBeVisible();

  await page.getByTestId("add-task-morning").click();
  await page.getByTestId("add-title").fill("코드리뷰 처리");
  await page.getByTestId("add-submit").click();

  const row = page.getByTestId("task-row").filter({ hasText: "코드리뷰 처리" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "마감" }).click();
  await expect(row.getByText("완결")).toBeVisible();
});
