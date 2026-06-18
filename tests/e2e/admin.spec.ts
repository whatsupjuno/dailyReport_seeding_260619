import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("관리자: 사용자 목록 표시 + 사용자 추가", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/users");
  await expect(page.getByTestId("admin-users-table")).toContainText("김도윤");

  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("테스트사원");
  await page.getByTestId("user-loginid").fill("test.member");
  await page.getByTestId("add-user-submit").click();

  await expect(page.getByTestId("admin-users-table")).toContainText("테스트사원");
});

test("관리자: 그룹·그룹장 카드 표시", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/groups");
  await expect(page.getByTestId("admin-groups")).toContainText("개발팀");
  await expect(page.getByTestId("admin-groups")).toContainText("김도윤"); // 그룹장
});
