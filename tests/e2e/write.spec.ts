import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// v2 단일목록 작성 (오세림: 오늘 보고서 없음 → 신규 v2 + 어제 미완료 보유)
test.describe.configure({ mode: "serial" });

test("어제 미완료 불러오기 → 업무 추가 → 마감(버킷) → 마감 취소", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "oh.serim");
  await expect(page.getByText("오늘 할 일을 한 번에 적어두세요")).toBeVisible();

  // 미완료 업무 불러오기(팝업에서 선택 → 추가)
  await page.getByTestId("carryover").click();
  await expect(page.getByTestId("carry-modal")).toBeVisible();
  await expect(page.getByTestId("carry-candidate").filter({ hasText: "컴포넌트 토큰 정리" })).toBeVisible();
  await page.getByTestId("carry-confirm").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "컴포넌트 토큰 정리" })).toBeVisible();

  // 신규 업무 추가
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("로그인 모듈 마무리");
  await page.getByTestId("add-submit").click();
  const row = page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" });
  await expect(row).toBeVisible();

  // 마감 → 결과 버킷으로(✓ 마감 칩)
  await row.getByRole("button", { name: "마감", exact: true }).click();
  const done = page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" });
  await expect(done.getByText(/✓ 마감/)).toBeVisible();

  // 마감 취소 → 다시 할 일
  await done.getByRole("button", { name: "마감 취소" }).click();
  await expect(
    page.getByTestId("task-row").filter({ hasText: "로그인 모듈 마무리" }).getByRole("button", { name: "마감", exact: true }),
  ).toBeVisible();
});

test("계획 제출(1차) → 제출하기(최종) 2단계", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "oh.serim"); // 위 테스트로 업무 보유
  // 1차 계획 제출
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("report-status")).toContainText("계획제출");
  // 2차 최종 제출(모달)
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("submit-modal")).toBeVisible();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");

  // 검수대기(review): 승인 전까지 편집 가능 — 업무 추가 노출, 제출 버튼은 숨김, 안내 배너 표시.
  await expect(page.getByTestId("add-task")).toHaveCount(1);
  await expect(page.getByTestId("primary-action")).toHaveCount(0); // 재제출 버튼 없음
  await expect(page.getByTestId("mode-banner")).toContainText("승인 전까지 수정");
});

test("빈 계획 제출 차단", async ({ page }) => {
  const dialogs: string[] = [];
  page.on("dialog", (d) => {
    dialogs.push(d.message());
    d.accept();
  });
  await login(page, "kim.jiwon"); // 보고서 없음 → 신규(0건)
  await expect(page.getByTestId("report-status")).toContainText(/작성중|미작성/);
  await page.getByTestId("primary-action").click();
  expect(dialogs.some((m) => m.includes("업무를 1개 이상"))).toBeTruthy();
});

test("업무 추가: 파일+URL 첨부 → 칩 표시, ⋯ 메뉴(수정/마감/삭제)로 삭제", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho");

  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("첨부 테스트 업무");
  // 파일 첨부
  await page.getByTestId("task-file-pick").locator("input[type=file]").setInputFiles({ name: "스펙.txt", mimeType: "text/plain", buffer: Buffer.from("spec") });
  await expect(page.getByTestId("task-pending-file")).toContainText("스펙.txt");
  // URL 추가
  await page.getByTestId("task-url-add").click();
  await page.getByTestId("task-url-input").fill("https://example.com/spec");
  await page.getByTestId("add-submit").click();

  const row = page.getByTestId("task-row").filter({ hasText: "첨부 테스트 업무" });
  await expect(row.getByTestId("task-att-chip")).toHaveCount(2, { timeout: 10000 });
  await expect(row).toContainText("스펙.txt");
  await expect(row).toContainText("https://example.com/spec");

  // ⋯ 메뉴 드롭다운: 수정 / 마감 / 삭제
  await row.getByTestId("task-menu").click();
  await expect(page.getByTestId("task-menu-popover")).toBeVisible();
  await expect(page.getByTestId("menu-edit")).toBeVisible();
  await expect(page.getByTestId("menu-close")).toContainText("마감");
  await page.getByTestId("menu-delete").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "첨부 테스트 업무" })).toHaveCount(0);
});

test("기존 업무에 행별 '＋첨부파일·코멘트'(통일 에디터)로 파일+URL 추가", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho");

  // 첨부 없이 업무 추가
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("행첨부 테스트");
  await page.getByTestId("add-submit").click();
  const row = page.getByTestId("task-row").filter({ hasText: "행첨부 테스트" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("task-att-chip")).toHaveCount(0);

  // 행별 '＋ 첨부파일·코멘트' → 통일 에디터(자동 등록: 취소/첨부 버튼 없음)
  await row.getByTestId("task-att-add").click();
  await expect(row.getByTestId("attach-editor")).toBeVisible();
  // 파일은 선택만으로 즉시 등록
  await row.getByTestId("ae-file-pick").locator("input[type=file]").setInputFiles({ name: "근거.txt", mimeType: "text/plain", buffer: Buffer.from("ref") });
  await expect(row.getByTestId("task-att-chip")).toHaveCount(1, { timeout: 10000 });
  await expect(row).toContainText("근거.txt");
  // URL은 입력 후 Enter만으로 즉시 등록
  await row.getByTestId("ae-url-add").click();
  await row.getByTestId("ae-url-input").fill("https://example.com/ref");
  await row.getByTestId("ae-url-input").press("Enter");
  await expect(row.getByTestId("task-att-chip")).toHaveCount(2, { timeout: 10000 });
  await expect(row).toContainText("https://example.com/ref");
});

test("업무 설명: 추가 폼 입력 → 행 박스 표시(라벨 없음) → 더보기/접기 → ⋯ 수정", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "choi.minho");

  // 3줄 초과 긴 설명 → 더보기/접기 노출
  const longDesc = Array.from({ length: 8 }, (_, i) => `설명 줄 ${i + 1} — 재시도 흐름 검증 포함`).join("\n");
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("설명 테스트 업무");
  await page.getByTestId("add-desc").fill(longDesc);
  await page.getByTestId("add-submit").click();

  const row = page.getByTestId("task-row").filter({ hasText: "설명 테스트 업무" });
  await expect(row.getByTestId("task-desc")).toBeVisible();
  // 라벨 '업무 설명'은 제거됨
  await expect(row.getByTestId("task-desc")).not.toContainText("업무 설명");
  await expect(row.getByTestId("task-desc")).toContainText("재시도 흐름 검증");
  // 더보기/접기 토글
  await expect(row.getByTestId("desc-toggle")).toContainText("더보기");
  await row.getByTestId("desc-toggle").click();
  await expect(row.getByTestId("desc-toggle")).toContainText("접기");

  // ⋯ 수정 → 기존 설명이 채워져 있고, 변경 후 저장하면 행에 반영
  await row.getByTestId("task-menu").click();
  await page.getByTestId("menu-edit").click();
  await expect(page.getByTestId("edit-desc")).toHaveValue(/재시도 흐름 검증/);
  await page.getByTestId("edit-desc").fill("수정된 설명 — 정산 정합성 체크 추가");
  await page.getByTestId("edit-save").click();
  await expect(row.getByTestId("task-desc")).toContainText("정산 정합성 체크 추가");
});
