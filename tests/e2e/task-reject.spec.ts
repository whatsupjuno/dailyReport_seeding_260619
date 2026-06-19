import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #3 업무별 반려 (박서준: 검수대기 + 시드 행반려 1건). task-reject 전용 사용자.
test.describe.configure({ mode: "serial" });

test("검수자: 행 반려 추가 → 부분 반려로 회신(보고서 반려, status 유지 후 1회 전이)", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("박서준").click();

  // 시드 행반려 밴드 노출 + 액션바 '부분 반려로 회신'
  await expect(page.getByTestId("row-reject-band")).toBeVisible();
  await expect(page.getByTestId("open-reject-count")).toContainText("1건");

  // 추가 행 반려: '주문 취소 플로우 리팩터'
  const row = page.getByTestId("review-task-row").filter({ hasText: "주문 취소 플로우 리팩터" });
  await row.getByRole("button", { name: "반려", exact: true }).click();
  await page.getByTestId("row-reject-comment").fill("정산 영향도 분석 결과를 함께 첨부해 주세요.");
  await row.getByRole("button", { name: "이 업무 반려" }).click();
  await expect(page.getByTestId("open-reject-count")).toContainText("2건");

  // 부분 반려로 회신(전역 코멘트 없이) → 보고서 반려
  await page.getByTestId("reject-open").click();
  await page.getByTestId("reject-submit").click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId("review-queue")).not.toContainText("박서준");
});

test("작성자: 반려 확인 → 반려 밴드 표시 → 재제출", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "park.seojun");
  await expect(page.getByTestId("report-status")).toContainText("반려");
  await expect(page.getByTestId("mode-banner")).toContainText("반려");
  await expect(page.getByTestId("reject-band").first()).toBeVisible();

  // 다시 제출(모달 확인) → 검수대기
  await page.getByTestId("primary-action").click();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
  await expect(page.getByTestId("reject-band")).toHaveCount(0);
});
