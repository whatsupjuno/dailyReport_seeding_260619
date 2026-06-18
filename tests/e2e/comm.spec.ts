import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("오후 마감: 커뮤니케이션 기록 추가 + 임시저장", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho");

  // morningPlan → 계획 제출 → morningClose
  await page.getByTestId("add-task-plan").click();
  await page.getByTestId("add-title").fill("거래처 미팅 준비");
  await page.getByTestId("add-submit").click();
  await page.getByTestId("primary-action").click();
  await expect(page.getByText("오전 업무를 마감")).toBeVisible();

  // 오전 마감하기 → afternoonClose
  await page.getByTestId("primary-action").click();
  await expect(page.getByText("오후 업무를 마감")).toBeVisible();

  // 커뮤니케이션 추가
  await expect(page.getByTestId("comm-section")).toBeVisible();
  await page.getByTestId("comm-who").fill("김바이어");
  await page.getByTestId("comm-summary").fill("납기 일정 협의");
  await page.getByTestId("comm-add").click();
  await expect(page.getByTestId("comm-row").filter({ hasText: "김바이어" })).toBeVisible();

  // 임시저장 (일일 코멘트)
  await page.getByTestId("daily-comment").fill("오늘 거래처 미팅 완료, 내일 견적 발송 예정.");
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/api/reports/`) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByTestId("save-draft").click();
  await saved;
  // 새로고침 후에도 코멘트 유지
  await page.reload();
  await expect(page.getByTestId("daily-comment")).toHaveValue(/거래처 미팅 완료/);
});
