import { test, expect } from "@playwright/test";
import { login, logout } from "./helpers";

test("로그인 후 작성 화면 진입, 로그아웃", async ({ page }) => {
  await login(page, "kim.doyun");
  await expect(page.getByTestId("profile-pill")).toContainText("김도윤");
  await logout(page);
  await expect(page).toHaveURL(/\/login/);
});

test("틀린 인증번호는 오류 표시", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-id").fill("kim.doyun");
  for (let i = 0; i < 4; i++) await page.getByLabel(`인증번호 ${i + 1}번째 자리`).fill("0");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("인증번호가 일치하지 않습니다")).toBeVisible();
});

test("존재하지 않는 아이디는 오류 표시", async ({ page }) => {
  await page.goto("/login");
  await page.locator("#login-id").fill("nobody.here");
  for (let i = 0; i < 4; i++) await page.getByLabel(`인증번호 ${i + 1}번째 자리`).fill("1");
  await page.getByRole("button", { name: "로그인" }).click();
  await expect(page.getByText("존재하지 않는 아이디입니다")).toBeVisible();
});
