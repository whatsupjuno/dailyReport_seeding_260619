import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// P0 프로젝트 관리 수직 슬라이스: 마이그레이션→API→페이지→모달→검증→상태배지→작성 드롭다운 연동(보관 제외).
test.describe.configure({ mode: "serial" });

const PROJ = "테스트프로젝트A";

test("관리자: 프로젝트 추가(필수 검증) → 표 + 상태배지 + 작성 드롭다운 노출", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/projects");

  // 서브내비에 '프로젝트 관리' 노출
  await expect(page.getByTestId("admin-submenu")).toContainText("프로젝트 관리");

  // 추가 모달 — 필수 3종 미충족 시 저장 비활성
  await page.getByTestId("add-project-open").click();
  await expect(page.getByTestId("project-modal")).toBeVisible();
  await expect(page.getByTestId("project-save")).toBeDisabled();

  // 필수(프로젝트·고객명) 입력 → 담당자는 기본 선택 → 저장 활성
  await page.getByTestId("pf-name").fill(PROJ);
  await page.getByTestId("pf-cust-name").fill("웨이블");
  await expect(page.getByTestId("project-save")).toBeEnabled();

  const created = page.waitForResponse((r) => r.url().endsWith("/api/admin/projects") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("project-save").click();
  await created;

  // 표에 프로젝트 + 상태배지(진행중)
  const row = page.getByTestId("admin-project-row").filter({ hasText: PROJ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("진행중");
  await expect(row).toContainText("웨이블");
});

test("작성 화면: 보관 제외 프로젝트가 업무 추가 드롭다운에 노출", async ({ page }) => {
  await login(page, "oh.serim");
  await page.getByTestId("add-task").click();
  const sel = page.getByTestId("add-project-select");
  await expect(sel).toBeVisible();
  await expect(sel).toContainText(PROJ);
});

test("관리자: 상태를 '보관'으로 수정 → 배지 갱신 + 작성 드롭다운에서 제외", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/projects");

  const row = page.getByTestId("admin-project-row").filter({ hasText: PROJ });
  await row.getByRole("button", { name: "수정" }).click();
  await expect(page.getByTestId("project-modal")).toBeVisible();
  await page.getByTestId("pf-status").selectOption("보관");
  const saved = page.waitForResponse((r) => /\/api\/admin\/projects\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("project-save").click();
  await saved;
  await expect(page.getByTestId("admin-project-row").filter({ hasText: PROJ })).toContainText("보관");

  // 보관 프로젝트는 작성 드롭다운에서 제외
  await login(page, "oh.serim");
  await page.getByTestId("add-task").click();
  const sel = page.getByTestId("add-project-select");
  // 드롭다운이 비면(다른 보관제외 프로젝트도 없을 때) 아예 렌더되지 않을 수 있음 — 보관 프로젝트명만 없으면 충족.
  if (await sel.count()) await expect(sel).not.toContainText(PROJ);
});
