import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// 최상위 사용자(위에 검수자 없음)의 본인 보고서 셀프 승인 — 직무분리 완화는 최상위 한정
test.describe.configure({ mode: "serial" });

test("최상위 관리자는 본인 보고서를 직접 승인(셀프 승인)", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "park.sora"); // 시드 유일 admin → 위에 검수자 없음

  // 업무 1건 추가 후 2단계 제출로 검수대기 도달
  await page.getByTestId("add-task").click();
  await page.getByTestId("add-title").fill("주간 운영 점검");
  await page.getByTestId("add-submit").click();
  const taskRow = page.getByTestId("task-row").filter({ hasText: "주간 운영 점검" });
  await expect(taskRow).toBeVisible();

  // admin owner는 댓글 작성권한이 있으며, 본인 댓글 수정·삭제도 같은 권한 기준으로 가능해야 한다.
  await taskRow.getByTestId("comment-button").click();
  await page.getByTestId("comment-input").fill("운영 점검 사전 메모");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "운영 점검 사전 메모" })).toBeVisible();
  await page.getByTestId("comment-edit").click();
  await page.getByTestId("comment-edit-input").fill("운영 점검 사전 메모 수정");
  await page.getByTestId("comment-edit-save").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "운영 점검 사전 메모 수정" })).toBeVisible();
  await page.getByTestId("comment-delete").click();
  await page.getByTestId("comment-delete-confirm").click();
  await expect(page.getByTestId("comment-tombstone")).toBeVisible();
  await page.getByTestId("comment-close").click();

  await page.getByTestId("primary-action").click(); // 계획제출
  await expect(page.getByTestId("report-status")).toContainText("계획제출");
  await page.getByTestId("primary-action").click(); // 최종 제출 모달
  await page.getByTestId("submit-confirm").click();
  await expect(page.getByTestId("report-status")).toContainText("검수대기");

  // 팀 목록: 본인 행에 '검수'가 노출되고, 클릭 시 바운스 없이 검수 화면 진입
  await page.goto("/reports");
  const ownRow = page.getByTestId("mgr-row").filter({ hasText: "박소라" });
  const review = ownRow.getByRole("link", { name: "상세 ›" });
  await expect(review).toHaveAttribute("href", /\/review\/\d+/); // 셀프승인 가능 → 본인 행이 검수 상세로 연결(편집기 아님)
  await review.click();
  await expect(page).toHaveURL(/\/review\/\d+/); // 셀프검수 가드에 막혀 /review로 튕기지 않음
  await expect(page.getByTestId(/row-reject-\d+/)).toHaveCount(0); // 행 반려 API는 셀프 금지라 UI도 미노출

  // 셀프 승인 → 승인 처리 (POST 완료를 기다린 뒤 이동 — 레이스 방지)
  const approved = page.waitForResponse(
    (r) => r.url().includes("/approve") && r.request().method() === "POST" && r.ok(),
  );
  await page.getByTestId("approve").click();
  await approved;
  await expect(page).toHaveURL(/\/review(\?|$)/); // 승인 후 큐로 복귀
  await page.goto("/reports");
  await expect(page.getByTestId("mgr-row").filter({ hasText: "박소라" })).toContainText("승인");
});

test("관리자는 타인 보고서를 열람만 — 액션바 숨김 + 승인/댓글 403 (브리프 §3)", async ({ page }) => {
  await login(page, "park.sora"); // 유일 admin (운영, 그룹장 아님 → 검수 액션 권한 없음)

  // 팀 보고 현황에서 박지훈(영업팀, 시드 휴직 검수대기) 보고서 열람
  await page.goto("/reports");
  const row = page.getByTestId("mgr-row").filter({ hasText: "박지훈" });
  await row.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/review\/\d+/); // 관리자도 열람은 가능(바운스 없음)
  const reportId = page.url().match(/\/review\/(\d+)/)![1];

  // 열람 전용: 안내 배너 노출 + 승인/반려 버튼 미렌더
  await expect(page.getByTestId("readonly-bar")).toBeVisible();
  await expect(page.getByTestId("approve")).toHaveCount(0);
  await expect(page.getByTestId("reject-open")).toHaveCount(0);

  // 직접 API 호출도 차단(403)
  const ap = await page.request.post(`/api/reviews/${reportId}/approve`);
  expect(ap.status()).toBe(403);
});
