import { expect, type Page } from "@playwright/test";

export const FIXED_CODE = "1234";

/** 고정 코드(1234)로 로그인하고 작성 화면까지 진입 */
export async function login(page: Page, loginId: string) {
  await page.goto("/login");
  await page.locator("#login-id").fill(loginId);
  for (let i = 0; i < 4; i++) {
    await page.getByLabel(`인증번호 ${i + 1}번째 자리`).fill(FIXED_CODE[i]);
  }
  await page.getByRole("button", { name: "로그인" }).click();
  await page.waitForURL(/\/report\//);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "로그아웃" }).click();
  await page.waitForURL(/\/login/);
}

export { expect };
