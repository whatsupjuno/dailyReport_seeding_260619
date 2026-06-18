import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("그룹장 목록: 팀 보고 현황에 구성원 표시", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/reports");
  await expect(page.getByText("팀 보고 현황")).toBeVisible();
  await expect(page.getByTestId("mgr-table")).toContainText("정유나");
  await expect(page.getByTestId("mgr-table")).toContainText("박서준");
});

test("검수 승인: 박서준 보고서 승인 → 큐에서 사라짐", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await expect(page.getByTestId("review-queue")).toContainText("박서준");
  await page.getByTestId("review-queue").getByText("박서준").click();
  await expect(page.getByTestId("review-status")).toBeVisible();
  await page.getByTestId("approve").click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId("review-queue")).not.toContainText("박서준");
});

test("검수 반려: 정유나 보고서 오후 지목 반려", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("정유나").click();
  await page.getByTestId("reject-open").click();
  await page.getByTestId("reject-target").selectOption("오후");
  await page.getByTestId("reject-comment").fill("오후 업무 계획을 14시 이후로 구체화해 주세요.");
  await page.getByTestId("reject-submit").click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId("review-queue")).not.toContainText("정유나");
});

test("직원 재작성: 반려 확인 후 재제출", async ({ page }) => {
  await login(page, "jung.yuna"); // 직전 테스트로 반려 상태
  await expect(page.getByTestId("mode-banner")).toContainText("반려");
  await page.getByTestId("primary-action").click(); // 재제출하기
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
});
