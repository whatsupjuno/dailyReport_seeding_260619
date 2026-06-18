import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("직원은 관리/검수 화면 접근 시 작성으로 리다이렉트", async ({ page }) => {
  await login(page, "jung.yuna");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/report/);
  await page.goto("/review");
  await expect(page).toHaveURL(/\/report/);
});

test("미인증 사용자는 로그인으로 리다이렉트", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/login/);
});
