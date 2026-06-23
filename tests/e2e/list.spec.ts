import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// 목록(팀 보고 현황) — '승인' 탭은 날짜와 무관하게 승인 완료된 보고서를 모아 보여줘야 한다.
// (단일-날짜 스냅샷이면 과거에 승인한 보고서가 안 보이던 문제)
test("관리자 목록 승인 탭: 날짜 무관하게 승인 완료 보고서 노출 + 날짜 picker 숨김", async ({ page }) => {
  await login(page, "park.sora"); // 운영 admin → 팀 보고 현황 접근
  await page.goto("/reports");
  await expect(page.getByTestId("mgr-table")).toBeVisible();

  await page.getByRole("link", { name: /^승인/ }).click();
  await expect(page).toHaveURL(/tab=approved/);

  // 승인 탭에선 날짜 picker 숨김(날짜 무관)
  await expect(page.getByTestId("period-select")).toHaveCount(0);
  await expect(page.getByText("날짜와 관계없이")).toBeVisible();

  // 시드: 오세림(어제)·김서연(2일 전 v1) — 서로 다른 날짜의 승인 보고서가 함께 보인다
  await expect(page.getByTestId("mgr-row").filter({ hasText: "오세림" })).toContainText("승인");
  await expect(page.getByTestId("mgr-row").filter({ hasText: "김서연" })).toContainText("승인");
});
