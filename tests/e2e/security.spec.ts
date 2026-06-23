import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test("IDOR: 타인 보고서에 업무 추가 시 403", async ({ page }) => {
  await login(page, "park.sora"); // 관리자라도 소유자 아니면 작성 불가
  const res = await page.request.post("/api/reports/1/tasks", { data: { title: "침입 시도" } });
  expect(res.status()).toBe(403);
});

test("잘못된 ID(비정규/지수)는 400 — DB 범위초과 500 방지", async ({ page }) => {
  await login(page, "park.sora");
  for (const bad of ["abc", "1e3", "0x10"]) {
    const res = await page.request.get(`/api/tasks/${bad}/comments`);
    expect(res.status()).toBe(400);
  }
});

test("검수 상세 페이지: 비정상 ID는 404 — DB 에러(500) 방지", async ({ page }) => {
  await login(page, "park.sora"); // admin → requireReviewer 통과
  for (const bad of ["abc", "1.5", "0x10"]) {
    const resp = await page.goto(`/review/${bad}`);
    expect(resp?.status()).toBe(404);
  }
});

test("휴가 우회: 검수대기 보고서를 vacationType만으로 휴가 전환 → 409", async ({ page }) => {
  await login(page, "park.seojun"); // 검수대기(시드)
  const reportId = await page.locator("[data-report-id]").getAttribute("data-report-id");
  const res = await page.request.post(`/api/reports/${reportId}/advance`, { data: { vacationType: "연차" } });
  expect(res.status()).toBe(409);
});

test("미인증 API 호출은 401", async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.post("/api/reports/1/tasks", { data: { title: "x" } });
  expect(res.status()).toBe(401);
});
