import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// #1 업무별 댓글 (정유나: 검수대기 + 그룹장(김도윤) 미읽음 댓글 1건 시드)
test("작성자: 미읽음 핀 → 드로어 열람 시 읽음 처리 + 답글 등록", async ({ page }) => {
  await login(page, "jung.yuna");
  // 결제 모듈 환불 API 연동 업무(완결, 오전 버킷)에 미읽음 핀
  const row = page.getByTestId("task-row").filter({ hasText: "환불 API 연동" });
  await expect(row).toBeVisible();
  await expect(row.getByTestId("comment-unread")).toBeVisible();

  // 드로어 열기 → 댓글 2건 + 작성자(그룹장) 코멘트 표시
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();
  await expect(page.getByTestId("comment-item")).toHaveCount(2);

  // 답글 등록
  await page.getByTestId("comment-input").fill("롤백 절차도 점검해서 공유드리겠습니다.");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-item")).toHaveCount(3);

  // 닫고 새로고침 → 미읽음 해제(읽음 핀)
  await page.getByTestId("comment-close").click();
  await expect(page.getByTestId("task-row").filter({ hasText: "환불 API 연동" }).getByTestId("comment-unread")).toHaveCount(0);
});

test("작성자: 댓글에 답글(대댓글) → 부모 아래 1단계 중첩", async ({ page }) => {
  await login(page, "jung.yuna");
  const row = page.getByTestId("task-row").filter({ hasText: "환불 API 연동" });
  await expect(row).toBeVisible();
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();

  // 첫 댓글에 답글 작성
  await page.getByTestId("reply-open").first().click();
  await page.getByTestId("reply-input").fill("이 부분은 운영팀과 협의했습니다.");
  await page.getByTestId("reply-post").click();

  // 답글이 부모와 같은 thread 안에 중첩(부모+답글=2), 답글 텍스트 표시
  await expect(page.getByTestId("comment-item").filter({ hasText: "운영팀과 협의" })).toBeVisible();
  const firstThread = page.getByTestId("comment-thread").first();
  await expect(firstThread.getByTestId("comment-item")).toHaveCount(2);
  // 1단계 강제: 답글(자식)엔 답글 버튼 없음 → thread당 reply-open은 부모 1개뿐
  await expect(firstThread.getByTestId("reply-open")).toHaveCount(1);
});

test("검수자: 업무 댓글로 피드백 등록", async ({ page }) => {
  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("정유나").click();
  const row = page.getByTestId("review-task-row").filter({ hasText: "환불 API 연동" });
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();
  await page.getByTestId("comment-input").fill("운영 반영 일정 확정되면 알려주세요.");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "운영 반영 일정" })).toBeVisible();
});
