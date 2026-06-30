import { test, expect } from "@playwright/test";
import { Client } from "pg";
import { login } from "./helpers";

const DB = process.env.TEST_DATABASE_URL ?? "postgresql://seeding:seeding@localhost:5432/seeding_test";

async function db<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const c = new Client({ connectionString: DB });
  await c.connect();
  try {
    const r = await c.query(sql, params as never);
    return r.rows as T[];
  } finally {
    await c.end();
  }
}

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

test("그룹 API: malformed body는 400으로 차단", async ({ page }) => {
  await login(page, "park.sora");

  const badName = await page.request.post("/api/admin/groups", { data: { name: 123 } });
  expect(badName.status()).toBe(400);

  const badLeader = await page.request.post("/api/admin/groups", { data: { name: "보안검증팀", leaderId: [1] } });
  expect(badLeader.status()).toBe(400);

  const badPatch = await page.request.patch("/api/admin/groups/1", { data: { name: "개발팀", leaderId: { id: 1 } } });
  expect(badPatch.status()).toBe(400);
});

test("그룹장 동시 수정: 그룹 PATCH와 사용자 강등은 deadlock/500 없이 종료", async ({ page }) => {
  await login(page, "park.sora");
  const target = (
    await db<{ group_id: number; group_name: string; user_id: number; user_name: string }>(
      `SELECT g.id AS group_id, g.name AS group_name, u.id AS user_id, u.name AS user_name
         FROM groups g
         JOIN users u ON u.id = g.leader_user_id
        WHERE g.name = '개발팀' AND u.login_id = 'kim.doyun'
        LIMIT 1`,
    )
  )[0];
  expect(target?.group_id).toBeTruthy();

  try {
    const [groupRes, userRes] = await Promise.all([
      page.request.patch(`/api/admin/groups/${target.group_id}`, {
        data: { name: target.group_name, leaderId: Number(target.user_id) },
      }),
      page.request.patch(`/api/admin/users/${target.user_id}`, {
        data: { name: target.user_name, role: "employee", groupId: Number(target.group_id), active: true },
      }),
    ]);

    expect(groupRes.status()).not.toBe(500);
    expect(userRes.status()).not.toBe(500);
    expect([200, 400]).toContain(groupRes.status());
    expect(userRes.status()).toBe(200);
  } finally {
    const restoredUser = await page.request.patch(`/api/admin/users/${target.user_id}`, {
      data: { name: target.user_name, role: "group_leader", groupId: Number(target.group_id), active: true },
    });
    expect(restoredUser.status()).toBe(200);
    const restoredGroup = await page.request.patch(`/api/admin/groups/${target.group_id}`, {
      data: { name: target.group_name, leaderId: Number(target.user_id) },
    });
    expect(restoredGroup.status()).toBe(200);
  }
});

test("댓글 멘션: 접근권 없는 활성 사용자는 알림 수신자로 승격되지 않음", async ({ page }) => {
  const target = (
    await db<{ task_id: number; forbidden_user_id: number }>(
      `SELECT t.id
              AS task_id,
              forbidden.id AS forbidden_user_id
         FROM tasks t
         JOIN daily_reports r ON r.id = t.report_id
         JOIN users u ON u.id = r.user_id
         JOIN users forbidden ON forbidden.login_id = $3
        WHERE u.login_id = $1 AND t.title = $2
        LIMIT 1`,
      ["jung.yuna", "정산 배치 오류 로그 분석", "lee.haneul"],
    )
  )[0];
  expect(target?.task_id).toBeTruthy();

  const before = (
    await db<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM notifications n
         JOIN users u ON u.id = n.user_id
        WHERE u.login_id = $1 AND n.kind = 'comment_mention'`,
      ["lee.haneul"],
    )
  )[0]?.n ?? 0;

  await login(page, "jung.yuna");
  const res = await page.request.post(`/api/tasks/${target.task_id}/comments`, {
    data: { body: "@이하늘 접근권 없는 멘션은 알림으로 보내지지 않아야 합니다." },
  });
  expect(res.status()).toBe(200);
  const created = (await res.json()) as { id: number };
  const stored = (
    await db<{ mentions: string[] | number[] }>(
      `SELECT mentions FROM task_comments WHERE id = $1`,
      [created.id],
    )
  )[0];
  expect((stored.mentions ?? []).map(String)).not.toContain(String(target.forbidden_user_id));

  await expect.poll(async () => {
    const rows = await db<{ n: number }>(
      `SELECT count(*)::int AS n
         FROM notifications n
         JOIN users u ON u.id = n.user_id
        WHERE u.login_id = $1 AND n.kind = 'comment_mention'`,
      ["lee.haneul"],
    );
    return Number(rows[0]?.n ?? 0);
  }).toBe(Number(before));
});

test("미인증 API 호출은 401", async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.post("/api/reports/1/tasks", { data: { title: "x" } });
  expect(res.status()).toBe(401);
});
