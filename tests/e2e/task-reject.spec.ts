import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #3 업무별 반려 (박서준: 검수대기 + 시드 행반려 1건). task-reject 전용 사용자.
test.describe.configure({ mode: "serial" });

test("검수자: 행 반려 추가 → 부분 반려로 회신(보고서 반려, status 유지 후 1회 전이)", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("박서준").click();

  // 시드 행반려 밴드 노출 + 액션바 '부분 반려로 회신'
  await expect(page.getByTestId("row-reject-band")).toBeVisible();
  await expect(page.getByTestId("open-reject-count")).toContainText("1건");

  // 추가 행 반려: '주문 취소 플로우 리팩터'
  const row = page.getByTestId("review-task-row").filter({ hasText: "주문 취소 플로우 리팩터" });
  await row.getByRole("button", { name: "반려", exact: true }).click();
  // 회귀: 한 글자씩 입력해도 포커스 유지(행 컴포넌트 remount로 키보드 내려가던 버그). .fill 대신 pressSequentially.
  const reason = "정산 영향도 분석 결과를 함께 첨부해 주세요.";
  await page.getByTestId("row-reject-comment").click();
  await page.getByTestId("row-reject-comment").pressSequentially(reason);
  await expect(page.getByTestId("row-reject-comment")).toHaveValue(reason); // 전부 입력됐는지(포커스 유지 확인)
  await row.getByRole("button", { name: "이 업무 반려" }).click();
  await expect(page.getByTestId("open-reject-count")).toContainText("2건");

  // 부분 반려로 회신(전역 코멘트 없이) → 보고서 반려
  await page.getByTestId("reject-open").click();
  await page.getByTestId("reject-submit").click();
  await page.waitForURL(/\/review$/);
  await expect(page.getByTestId("review-queue")).not.toContainText("박서준");
});

test("작성자: 반려 확인 → 반려 밴드 표시 → 재제출", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "park.seojun");
  await expect(page.getByTestId("report-status")).toContainText("반려");
  await expect(page.getByTestId("mode-banner")).toContainText("반려");
  await expect(page.getByTestId("reject-band").first()).toBeVisible();

  // 다시 제출(모달 확인) → 검수대기
  await page.getByTestId("primary-action").click();
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
  await expect(page.getByTestId("reject-band")).toHaveCount(0);
});

// 회귀: 검수자가 '행 반려 없이 전역 코멘트로만' 반려해도 작성자가 보고서 전체를 수정·추가 후 재제출할 수 있어야 함.
// (실사용 버그: 반려받은 보고서가 코멘트만 가능하고 수정 불가였음)
test("전역 반려(행 반려 0건) → 작성자가 업무 추가·수정 후 재제출", async ({ page }) => {
  // 검수자: 박서준(위 테스트에서 재제출됨)을 전역 코멘트로만 반려
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("박서준").click();
  await page.getByTestId("reject-open").click();
  await expect(page.getByTestId("reject-modal")).toBeVisible();
  await page.getByTestId("reject-comment").fill("전반적으로 근거 자료가 부족합니다. 보완 후 다시 제출해 주세요.");
  await page.getByTestId("reject-submit").click();
  await page.waitForURL(/\/review$/);

  // 작성자: 반려 — 편집 카드(보고서 수정)에서 업무 추가가 가능해야 함(행 반려 0건이어도)
  page.on("dialog", (d) => d.accept());
  await login(page, "park.seojun");
  await expect(page.getByTestId("report-status")).toContainText("반려");
  await expect(page.getByText("반려된 보고서를 수정해 주세요")).toBeVisible();
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("점검 로그 근거 첨부 보완");
  await page.getByTestId("add-submit").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "점검 로그 근거 첨부 보완" })).toBeVisible();

  // '다시 제출' 모달(최종제출 아님, 이월 토글 없음) → 검수대기
  await page.getByTestId("primary-action").click();
  await expect(page.getByTestId("submit-modal")).toContainText("다시 제출할까요");
  await expect(page.getByTestId("carry-toggle")).toHaveCount(0);
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");
});
