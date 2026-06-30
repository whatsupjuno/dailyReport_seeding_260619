import { test, expect } from "@playwright/test";
import { login } from "./helpers";

// v5.0.15 댓글 고도화: @멘션 자동완성 · 수정(수정됨 배지) · soft-delete(묘비·대댓글 보존) · 그룹장 '미확인' 배지.
// 시드: 정유나(jung.yuna) "환불 API 연동" 업무에 [정유나(본인), 김도윤(그룹장)] 댓글. 마지막=그룹장 → 미확인.

// task[0]: 그룹장 마지막 댓글 시드(읽기전용 배지 검증 — comments.spec과 공유, 비파괴 유지)
const BADGE_ROW = "환불 API 연동";
// task[2]: 시드 댓글 없음 — 파괴적 시나리오(작성/수정/삭제) 전용으로 격리(다른 스펙 무간섭)
const DEST_ROW = "환불 정책 변경분 QA 시나리오 작성";

test("작성화면: 마지막 댓글이 그룹장이면 파란 '미확인' 배지(드로어 열기 전)", async ({ page }) => {
  await login(page, "jung.yuna");
  const row = page.getByTestId("task-row").filter({ hasText: BADGE_ROW });
  await expect(row).toBeVisible();
  // 드로어를 열기 전(읽음 처리 전)이라 미확인 배지 노출
  await expect(row.getByTestId("comment-unconfirmed")).toBeVisible();
});

test("@멘션: composer에서 @입력 → 실제 멤버 자동완성 팝업 → 선택 시 본문 치환", async ({ page }) => {
  await login(page, "jung.yuna");
  await page.getByTestId("task-row").filter({ hasText: DEST_ROW }).getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();

  // '@김' 입력 → 이름에 '김'이 포함된 활성 사용자만 필터(데모 이름 아닌 실제 조직)
  await page.getByTestId("comment-input").fill("점검 결과 공유드립니다 @김");
  await expect(page.getByTestId("mention-popup")).toBeVisible();
  const options = page.getByTestId("mention-option");
  expect(await options.count()).toBeGreaterThan(0);

  // 첫 항목 선택 → 팝업 닫힘 + 본문에 '@이름 ' 삽입
  await options.first().click();
  await expect(page.getByTestId("mention-popup")).toHaveCount(0);
  await expect(page.getByTestId("comment-input")).toHaveValue(/@\S+\s$/);
});

test("수정: 본인 댓글 인라인 수정 → 본문 교체 + '수정됨' 배지", async ({ page }) => {
  await login(page, "jung.yuna");
  await page.getByTestId("task-row").filter({ hasText: DEST_ROW }).getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();

  // 본인 댓글을 새로 작성(이 실행 내 결정적 대상)
  await page.getByTestId("comment-input").fill("수정 대상 원본 댓글");
  await page.getByTestId("comment-post").click();
  const target = page.getByTestId("comment-item").filter({ hasText: "수정 대상 원본 댓글" });
  await expect(target).toBeVisible();

  // 수정 → 인라인 textarea prefill → 저장
  await target.getByTestId("comment-edit").click();
  const editInput = page.getByTestId("comment-edit-input");
  await expect(editInput).toHaveValue("수정 대상 원본 댓글");
  await editInput.fill("수정된 본문입니다");
  await page.getByTestId("comment-edit-save").click();

  const edited = page.getByTestId("comment-item").filter({ hasText: "수정된 본문입니다" });
  await expect(edited).toBeVisible();
  await expect(edited.getByTestId("comment-edited")).toBeVisible();
});

test("삭제: 본인 댓글 2단계 확인 soft-delete → 묘비 + 대댓글 보존", async ({ page }) => {
  await login(page, "jung.yuna");
  await page.getByTestId("task-row").filter({ hasText: DEST_ROW }).getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();

  // 부모 댓글 + 답글(대댓글) 생성
  await page.getByTestId("comment-input").fill("삭제 대상 부모 댓글");
  await page.getByTestId("comment-post").click();
  const parent = page.getByTestId("comment-thread").filter({ hasText: "삭제 대상 부모 댓글" });
  await expect(parent).toBeVisible();
  await parent.getByTestId("reply-open").click();
  await parent.getByTestId("reply-input").fill("보존될 답글입니다");
  await parent.getByTestId("reply-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "보존될 답글입니다" })).toBeVisible();

  // 부모 댓글 삭제: '삭제' → '삭제할까요?' 2단계 확인
  const parentItem = page.getByTestId("comment-item").filter({ hasText: "삭제 대상 부모 댓글" });
  await parentItem.getByTestId("comment-delete").click();
  await parentItem.getByTestId("comment-delete-confirm").click();

  // 묘비 표시(본문 텍스트는 사라지므로 전역 locator) + 대댓글은 보존
  await expect(page.getByTestId("comment-tombstone").first()).toBeVisible();
  await expect(page.getByText(/에 삭제된 댓글입니다\./).first()).toBeVisible();
  await expect(page.getByText("삭제 대상 부모 댓글")).toHaveCount(0); // 원문 사라짐(묘비 치환)
  await expect(page.getByTestId("comment-item").filter({ hasText: "보존될 답글입니다" })).toBeVisible();
});
