import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("그룹장 목록: 팀 보고 현황에 구성원 표시", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/reports");
  await expect(page.getByText("팀 보고 현황")).toBeVisible();
  await expect(page.getByTestId("mgr-table")).toContainText("정유나");
  await expect(page.getByTestId("mgr-table")).toContainText("박서준");
});

test("검수 승인: 정유나 보고서 승인 → 큐에서 사라짐 + 재승인 409", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await expect(page.getByTestId("review-queue")).toContainText("정유나");
  await page.getByTestId("review-queue").getByText("정유나").click();
  await expect(page.getByTestId("review-status")).toBeVisible();
  const reportId = page.url().split("/").pop();
  await page.getByTestId("approve").click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId("review-queue")).not.toContainText("정유나");

  const re = await page.request.post(`/api/reviews/${reportId}/approve`);
  expect(re.status()).toBe(409);
});

test("계획제출 보고서도 검수 큐에 노출(B2)", async ({ page }) => {
  await login(page, "kim.jiwon"); // 김서연(계획제출) 그룹장
  await page.goto("/review");
  await expect(page.getByTestId("review-queue")).toContainText("김서연");
  await page.getByTestId("review-queue").getByText("김서연").click();
  // 계획제출 단계: 전체 승인/반려는 최종 제출 후
  await expect(page.getByTestId("plan-review-bar")).toBeVisible();
});
