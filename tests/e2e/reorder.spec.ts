import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #3 '오늘 할 일' 드래그 재정렬: 핸들 노출(2개↑) + sort_order 영속화
test("오늘 할 일: 드래그 핸들 + 순서 영속화", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "kim.seoyeon"); // 시드: 오늘 계획제출(편집 가능)
  await expect(page.getByText("오늘 할 일을 한 번에 적어두세요")).toBeVisible();

  // todo 2개 이상 보장
  for (const title of ["순서검증-가", "순서검증-나"]) {
    await page.getByTestId("add-task").click();
    await page.getByTestId("add-title").fill(title);
    await page.getByTestId("add-submit").click();
    await expect(page.getByTestId("task-row").filter({ hasText: title })).toBeVisible();
  }

  // todo ≥ 2 → 드래그 핸들 노출
  expect(await page.locator("[data-testid^='drag-handle-']").count()).toBeGreaterThanOrEqual(2);

  // 현재 todo 순서(id) 수집
  const ids = await page.locator("[data-todo-id]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-todo-id"))));
  expect(ids.length).toBeGreaterThanOrEqual(2);

  // 재정렬 API로 역순 영속화 → reload 후 DOM 순서 반영 확인
  const reportId = await page.locator("[data-report-id]").first().getAttribute("data-report-id");
  const res = await page.request.post(`/api/reports/${reportId}/reorder`, { data: { taskIds: [...ids].reverse() } });
  expect(res.ok()).toBeTruthy();
  await page.reload();
  const ids2 = await page.locator("[data-todo-id]").evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-todo-id"))));
  expect(ids2).toEqual([...ids].reverse());
});

// 타인 보고서 재정렬 차단(IDOR)
test("재정렬 IDOR: 타인 보고서 순서 변경 시 403", async ({ page }) => {
  await login(page, "kim.seoyeon");
  const res = await page.request.post("/api/reports/1/reorder", { data: { taskIds: [1, 2] } });
  expect(res.status()).toBe(403);
});
