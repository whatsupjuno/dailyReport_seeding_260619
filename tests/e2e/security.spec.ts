import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("IDOR: 타인 보고서에 업무 추가 시 403", async ({ page }) => {
  await login(page, "park.jihun");
  // report id=1 은 정유나 보고서(시드 첫 보고서). 소유자 아님 → 403
  const res = await page.request.post("/api/reports/1/tasks", {
    data: { sectionKind: "plan", title: "침입 시도" },
  });
  expect(res.status()).toBe(403);
});

test("잠긴 시간대 추가 400 + 휴가 우회 409", async ({ page }) => {
  await login(page, "park.jihun");
  const reportId = await page.locator("[data-report-id]").getAttribute("data-report-id");

  // 계획 작성 후 제출 → plan 잠금(morningClose)
  await page.getByTestId("add-task-plan").click();
  await page.getByTestId("add-title").fill("영업 제안서 초안");
  await page.getByTestId("add-submit").click();
  await page.getByTestId("primary-action").click();
  await expect(page.getByText("오전 업무를 마감")).toBeVisible();

  // 잠긴 plan에 업무 추가 → 400
  const locked = await page.request.post(`/api/reports/${reportId}/tasks`, {
    data: { sectionKind: "plan", title: "잠금 우회" },
  });
  expect(locked.status()).toBe(400);

  // 이미 진행된 보고서를 vacationType만으로 휴가 전환 → 409
  const vac = await page.request.post(`/api/reports/${reportId}/advance`, {
    data: { vacationType: "연차" },
  });
  expect(vac.status()).toBe(409);
});

test("미인증 API 호출은 401", async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.post("/api/reports/1/tasks", {
    data: { sectionKind: "plan", title: "x" },
  });
  expect(res.status()).toBe(401);
});
