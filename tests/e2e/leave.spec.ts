import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #2 휴가/휴직/기타 사유
test("작성자: 휴가로 전환 → 휴직(사유 필수) → 빈 사유 차단 → 제출", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await login(page, "lee.haneul"); // 보고서 없음 → 신규
  await page.getByTestId("go-vacation").click();
  await expect(page.getByTestId("vacation-card")).toBeVisible();

  await page.getByTestId("vac-type").selectOption("휴직");
  // 빈 사유로 제출 시도 → 차단
  await page.getByTestId("primary-action").click();
  expect(dialogs.some((m) => m.includes("사유가 필수"))).toBeTruthy();

  // 사유 입력 후 제출 → 검수대기(휴직)
  await page.getByTestId("vac-reason").fill("가족 돌봄으로 2주 휴직합니다. 진행 업무는 박지훈 님께 인계했습니다.");
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
});

test("검수자: 휴직 보고서는 부재 사유 카드로 표시", async ({ page }) => {
  await login(page, "choi.minho");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("박지훈").click();
  await expect(page.getByText("휴직입니다")).toBeVisible();
  await expect(page.getByText("부재 사유")).toBeVisible();
  await expect(page.getByText(/복귀 예정일은 9월 18일/)).toBeVisible();
});
