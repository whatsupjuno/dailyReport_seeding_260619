import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { login } from "./helpers";

// 댓글/대댓글/@멘션 작성 시 알맞은 user에게 notifications 행이 생기는지(자기 제외·중복 제거·멘션 우선) 검증.
// 메일 전송은 transport=log(실제 발송 X). 시드 시나리오: 정유나(owner/employee) ↔ 김도윤(개발팀 그룹장=검수자).
// 다른 스펙(comments/comment-advanced)이 쓰는 업무와 충돌하지 않도록, 시드 댓글이 없고 어느 스펙도
// 건드리지 않는 업무 "정산 배치 오류 로그 분석"(jung.yuna task[1])에서만 작성한다(공유 DB 비파괴).
const TASK = "정산 배치 오류 로그 분석";

const DB =
  process.env.TEST_DATABASE_URL ?? "postgresql://seeding:seeding@localhost:5432/seeding_test";

async function db<T>(sql: string, params: unknown[]): Promise<T[]> {
  const c = new Client({ connectionString: DB });
  await c.connect();
  try {
    const r = await c.query(sql, params as never);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

/** login_id 사용자가 받은 특정 kind 알림 개수 */
async function notifCount(loginId: string, kind: string): Promise<number> {
  const rows = await db<{ n: number }>(
    `SELECT count(*)::int AS n FROM notifications n JOIN users u ON u.id = n.user_id
      WHERE u.login_id = $1 AND n.kind = $2`,
    [loginId, kind],
  );
  return Number(rows[0]?.n ?? 0);
}

test("최상위 댓글 → 검수자(그룹장)에게 comment 알림, 작성자 본인은 제외", async ({ page }) => {
  const leaderBefore = await notifCount("kim.doyun", "comment");
  const selfBefore = await notifCount("jung.yuna", "comment");

  await login(page, "jung.yuna");
  const row = page.getByTestId("task-row").filter({ hasText: TASK });
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();
  await page.getByTestId("comment-input").fill("정산 배치 로그 분석 결과 공유드립니다. 확인 부탁드려요.");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "정산 배치 로그 분석 결과" })).toBeVisible();

  // 검수자에게 comment 1건 신규, 작성자 본인은 변화 없음(자기 제외)
  await expect.poll(() => notifCount("kim.doyun", "comment")).toBe(leaderBefore + 1);
  expect(await notifCount("jung.yuna", "comment")).toBe(selfBefore);
});

test("@멘션 → 언급된 사용자에게 comment_mention(멘션 우선·중복 제거)", async ({ page }) => {
  const mentionBefore = await notifCount("kim.doyun", "comment_mention");
  const commentBefore = await notifCount("kim.doyun", "comment");

  await login(page, "jung.yuna");
  const row = page.getByTestId("task-row").filter({ hasText: TASK });
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();
  // @김도윤이 본문 끝이 아니므로 자동완성 팝업은 뜨지 않음(서버가 mentions로 해석)
  await page.getByTestId("comment-input").fill("@김도윤 정산 배치 권한 진행 상황 검토 부탁드립니다.");
  await page.getByTestId("comment-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "정산 배치 권한 진행 상황" })).toBeVisible();

  // 멘션 1건 신규. 스레드(comment) 수신자였더라도 멘션 우선으로 승격 → comment는 늘지 않음(중복 제거).
  await expect.poll(() => notifCount("kim.doyun", "comment_mention")).toBe(mentionBefore + 1);
  expect(await notifCount("kim.doyun", "comment")).toBe(commentBefore);
});

test("대댓글 → 스레드 참여자(보고서 owner)에게 comment_reply, 부모 작성자 본인은 제외", async ({ page }) => {
  const ownerBefore = await notifCount("jung.yuna", "comment_reply");

  await login(page, "kim.doyun");
  await page.goto("/review");
  await page.getByTestId("review-queue").getByText("정유나").click();
  const row = page.getByTestId("review-task-row").filter({ hasText: TASK });
  await row.getByTestId("comment-button").click();
  await expect(page.getByTestId("comment-drawer")).toBeVisible();

  // 검수자(김도윤)가 최상위 댓글을 남긴 뒤, 그 댓글에 본인이 답글 → 부모 author=본인(제외), owner=정유나 수신.
  await page.getByTestId("comment-input").fill("정산 권한 관련 한 가지 확인 부탁드립니다.");
  await page.getByTestId("comment-post").click();
  const thread = page.getByTestId("comment-thread").filter({ hasText: "정산 권한 관련 한 가지 확인" });
  await expect(thread).toBeVisible();
  await thread.getByTestId("reply-open").click();
  await thread.getByTestId("reply-input").fill("권한 승인되면 바로 공유드릴게요.");
  await thread.getByTestId("reply-post").click();
  await expect(page.getByTestId("comment-item").filter({ hasText: "권한 승인되면 바로 공유" })).toBeVisible();

  // 답글 → 보고서 owner(정유나)에게 comment_reply 1건. 부모 작성자(본인)는 자기 제외.
  await expect.poll(() => notifCount("jung.yuna", "comment_reply")).toBe(ownerBefore + 1);
});
