import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("커뮤니케이션 기록 추가(메신저 유형) + 일일코멘트 임시저장 유지", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho"); // 보고서 없음 → 신규(work 모드)

  await expect(page.getByTestId("comm-section")).toBeVisible();
  await page.getByTestId("comm-type").selectOption("메신저");
  await page.getByTestId("comm-who").fill("김바이어");
  await page.getByTestId("comm-summary").fill("납기 일정 협의");
  await page.getByTestId("comm-add").click();
  await expect(page.getByTestId("comm-row").filter({ hasText: "김바이어" })).toBeVisible();

  // 일일 코멘트 임시저장
  await page.getByTestId("daily-comment").fill("오늘 거래처 미팅 완료, 내일 견적 발송 예정.");
  const saved = page.waitForResponse(
    (r) => r.url().includes(`/api/reports/`) && r.request().method() === "PATCH" && r.ok(),
  );
  await page.getByTestId("save-draft").click();
  await saved;
  await page.reload();
  await expect(page.getByTestId("daily-comment")).toHaveValue(/거래처 미팅 완료/);
});
