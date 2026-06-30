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

test("보고서 목록: 중복 query와 비정규 group 필터는 500/전체조회로 확장되지 않음", async ({ page }) => {
  await login(page, "park.sora");

  const dup = await page.goto("/reports?q=a&q=b");
  expect(dup?.status()).toBe(200);
  await expect(page.getByTestId("mgr-table")).toBeVisible();

  const invalidGroup = await page.goto("/reports?group=abc");
  expect(invalidGroup?.status()).toBe(200);
  await expect(page.getByTestId("mgr-row")).toHaveCount(0);
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

test("프로젝트 API: malformed body는 400으로 차단", async ({ page }) => {
  await login(page, "park.sora");
  const badName = await page.request.post("/api/admin/projects", { data: { name: 123, custName: "고객", ownerUserId: 1 } });
  expect(badName.status()).toBe(400);

  const badOwner = await page.request.post("/api/admin/projects", { data: { name: "프로젝트", custName: "고객", ownerUserId: [1] } });
  expect(badOwner.status()).toBe(400);

  const badPatch = await page.request.patch("/api/admin/projects/1", { data: { name: "프로젝트", custName: "고객", ownerUserId: { id: 1 } } });
  expect(badPatch.status()).toBe(400);
});

test("미인증 API 호출은 401", async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.post("/api/reports/1/tasks", { data: { title: "x" } });
  expect(res.status()).toBe(401);
});
