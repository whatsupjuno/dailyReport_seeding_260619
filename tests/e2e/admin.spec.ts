import { test, expect, type Browser } from "@playwright/test";
import { login } from "./helpers";

/** 격리 컨텍스트에서 주어진 코드로 로그인되는지 검증(작성 화면 진입 = 성공) */
async function expectLoginOk(browser: Browser, base: string, loginId: string, code: string) {
  const ctx = await browser.newContext({ baseURL: base });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.locator("#login-id").fill(loginId);
  for (let i = 0; i < 4; i++) await p.getByLabel(`인증번호 ${i + 1}번째 자리`).fill(code[i]);
  await p.getByRole("button", { name: "로그인" }).click();
  await p.waitForURL(/\/report\//, { timeout: 10000 });
  await ctx.close();
}

test("관리자: 사용자 목록 표시 + 사용자 추가", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/users");
  await expect(page.getByTestId("admin-users-table")).toContainText("김도윤");

  // 사이드 '메뉴' 서브내비 → 그룹 관리 이동
  await expect(page.getByTestId("admin-submenu")).toContainText("그룹 관리");
  await page.getByTestId("admin-submenu").getByRole("link", { name: "그룹 관리" }).click();
  await expect(page).toHaveURL(/\/admin\/groups/);
  await page.goto("/admin/users");

  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("테스트사원");
  await page.getByTestId("user-loginid").fill("test.member");
  await page.getByTestId("add-user-submit").click();

  await expect(page.getByTestId("admin-users-table")).toContainText("테스트사원");
});

test("관리자: 사용자 추가 시 인증번호 지정 + 상세화면에서 변경 → 해당 코드로 로그인", async ({ page, browser }) => {
  await login(page, "park.sora");
  const base = new URL(page.url()).origin;
  await page.goto("/admin/users");

  // 1) 인증번호(4321) 지정 + 소속 없음으로 사용자 추가
  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("코드사원");
  await page.getByTestId("user-loginid").fill("code.member");
  await page.getByTestId("user-group").selectOption("");
  await page.getByTestId("user-code").fill("4321");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/admin/users") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("add-user-submit").click();
  await created;
  await expect(page.getByTestId("admin-users-table")).toContainText("코드사원");

  // 2) 지정한 코드(4321)로 로그인 성공 (격리 컨텍스트 — admin 세션 보존)
  await expectLoginOk(browser, base, "code.member", "4321");

  // 3) 상세화면에서 인증번호 8765로 변경
  await page.getByTestId("admin-user-search").fill("코드사원");
  await page.getByTestId("admin-user-row").filter({ hasText: "코드사원" }).getByRole("link", { name: "프로필" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+/);
  await expect(page.getByTestId("profile-code-save")).toBeDisabled(); // 빈 입력 → 비활성
  await page.getByTestId("profile-code-input").fill("8765");
  page.once("dialog", (d) => d.accept());
  const changed = page.waitForResponse((r) => /\/api\/admin\/users\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("profile-code-save").click();
  await changed;

  // 4) 변경된 코드(8765)로 로그인 성공
  await expectLoginOk(browser, base, "code.member", "8765");
});

test("관리자: 사용자 검색 + 수정(이름·역할·활성) 저장", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/users");

  // 검색 필터
  await page.getByTestId("admin-user-search").fill("박서준");
  await expect(page.getByTestId("admin-user-row")).toHaveCount(1);
  await expect(page.getByTestId("admin-user-row")).toContainText("박서준");

  // 수정 모달 → 이름 변경 + 역할 변경 후 저장
  const row = page.getByTestId("admin-user-row").filter({ hasText: "박서준" });
  await row.getByRole("button", { name: "수정" }).click();
  await expect(page.getByTestId("admin-edit-modal")).toBeVisible();
  await page.getByTestId("admin-edit-name").fill("박서준(수정)");
  await page.getByTestId("admin-edit-role").selectOption("group_leader");
  const saved = page.waitForResponse((r) => r.url().includes("/api/admin/users/") && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("admin-edit-save").click();
  await saved;
  await page.getByTestId("admin-user-search").fill("박서준");
  await expect(page.getByTestId("admin-user-row")).toContainText("박서준(수정)");
  await expect(page.getByTestId("admin-user-row")).toContainText("그룹장");
});

test("관리자: 그룹·그룹장 카드 표시", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/groups");
  await expect(page.getByTestId("admin-groups")).toContainText("개발팀");
  await expect(page.getByTestId("admin-groups")).toContainText("김도윤"); // 그룹장
});

test("관리자: 그룹 생성→구성원 추가→그룹장 지정→구성원 제거→그룹 삭제", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/groups");

  // 1) 그룹 생성
  await page.getByTestId("add-group-open").click();
  await page.getByTestId("group-name").fill("QA자동화팀");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/admin/groups") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("group-create-submit").click();
  await created;
  const card = page.getByTestId("admin-group-card").filter({ hasText: "QA자동화팀" });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("group-leader-name")).toHaveText("미지정");

  // 2) 구성원 추가(박지훈: 영업팀 → QA자동화팀 이동)
  await card.getByRole("button", { name: "＋ 구성원 추가" }).click();
  await page.getByTestId("group-member-search").fill("박지훈");
  const added = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+\/members$/.test(r.url()) && r.request().method() === "POST" && r.ok());
  await page.getByTestId("group-member-modal").getByRole("button", { name: "추가" }).click();
  await added;
  await page.getByTestId("group-member-modal").getByRole("button", { name: "닫기" }).click();
  await expect(card).toContainText("박지훈");

  // 3) 직원 역할 사용자는 그룹장 후보에서 제외, 그룹장 역할 사용자는 비구성원이어도 지정 가능
  await card.getByRole("button", { name: "수정" }).click();
  await expect(page.getByTestId("group-edit-leader").locator("option", { hasText: "박지훈" })).toHaveCount(0);
  await page.getByTestId("group-edit-leader").selectOption({ label: "김도윤" });
  const saved = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("group-edit-save").click();
  await saved;
  await expect(card.getByTestId("group-leader-name")).toHaveText("김도윤");

  // 4) 구성원 제거(박지훈 ✕) → 비구성원 그룹장 지정은 유지
  const removed = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+\/members\?userId=\d+/.test(r.url()) && r.request().method() === "DELETE" && r.ok());
  await card.getByRole("button", { name: "박지훈 제거" }).click();
  await removed;
  await expect(card.getByText("구성원 없음")).toBeVisible();
  await expect(card.getByTestId("group-leader-name")).toHaveText("김도윤");

  // 5) 박지훈을 원래 그룹(영업팀)으로 복원 — 다른 스펙의 그룹 의존 보존
  const salesCard = page.getByTestId("admin-group-card").filter({ hasText: "영업팀" });
  await salesCard.getByRole("button", { name: "＋ 구성원 추가" }).click();
  await page.getByTestId("group-member-search").fill("박지훈");
  const restored = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+\/members$/.test(r.url()) && r.request().method() === "POST" && r.ok());
  await page.getByTestId("group-member-modal").getByRole("button", { name: "추가" }).click();
  await restored;
  await page.getByTestId("group-member-modal").getByRole("button", { name: "닫기" }).click();
  await expect(salesCard).toContainText("박지훈");

  // 6) 그룹 삭제
  page.once("dialog", (d) => d.accept());
  const deleted = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+$/.test(r.url()) && r.request().method() === "DELETE" && r.ok());
  await card.getByRole("button", { name: "삭제" }).click();
  await deleted;
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "QA자동화팀" })).toHaveCount(0);
});

test("관리자: 프로필 페이지에서 '보고서 작성 대상' 토글 → 목록에 '작성 제외' 반영", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/users");
  await page.getByTestId("admin-user-search").fill("정유나");
  const row = page.getByTestId("admin-user-row").filter({ hasText: "정유나" });
  await row.getByRole("link", { name: "프로필" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+/);

  // 기본은 작성 대상(on) → 끄고 저장
  const toggle = page.getByTestId("report-required-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  const saved = page.waitForResponse((r) => r.url().includes("/api/admin/users/") && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("profile-save").click();
  await saved;

  // 목록에서 '작성 제외' 배지 확인
  await page.goto("/admin/users");
  await page.getByTestId("admin-user-search").fill("정유나");
  await expect(page.getByTestId("admin-user-row").filter({ hasText: "정유나" })).toContainText("작성 제외");

  // 원복(작성 대상 on) — 다른 스펙의 팀 현황 의존(정유나 표시) 보존
  await page.getByTestId("admin-user-row").filter({ hasText: "정유나" }).getByRole("link", { name: "프로필" }).click();
  await page.getByTestId("report-required-toggle").click();
  const restored = page.waitForResponse((r) => r.url().includes("/api/admin/users/") && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("profile-save").click();
  await restored;
});

test("관리자: 사용자 추가 시 그룹장 역할 지정 → 그룹 메뉴에 그룹장으로 반영", async ({ page }) => {
  await login(page, "park.sora");

  // 1) 그룹장이 없는 새 그룹 생성
  await page.goto("/admin/groups");
  await page.getByTestId("add-group-open").click();
  await page.getByTestId("group-name").fill("리더검증팀");
  const gcreated = page.waitForResponse((r) => r.url().endsWith("/api/admin/groups") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("group-create-submit").click();
  await gcreated;
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "리더검증팀" }).getByTestId("group-leader-name")).toHaveText("미지정");

  // 2) 그룹장 역할로 사용자 추가 (소속 = 리더검증팀)
  await page.goto("/admin/users");
  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("신임리더");
  await page.getByTestId("user-loginid").fill("new.leader");
  await page.getByTestId("user-role").selectOption("group_leader");
  await page.getByTestId("user-group").selectOption({ label: "리더검증팀" });
  const ucreated = page.waitForResponse((r) => r.url().endsWith("/api/admin/users") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("add-user-submit").click();
  await ucreated;
  await expect(page.getByTestId("admin-users-table")).toContainText("신임리더");

  // 3) 그룹 메뉴 → 리더검증팀의 그룹장이 신임리더로 반영
  await page.goto("/admin/groups");
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "리더검증팀" }).getByTestId("group-leader-name")).toHaveText("신임리더");

  // 4) 그룹장을 비활성화하면 그룹장직도 해제
  await page.goto("/admin/users");
  await page.getByTestId("admin-user-search").fill("신임리더");
  const leaderRow = page.getByTestId("admin-user-row").filter({ hasText: "신임리더" });
  await leaderRow.getByRole("button", { name: "수정" }).click();
  await page.getByTestId("admin-edit-active").uncheck();
  const disabled = page.waitForResponse((r) => /\/api\/admin\/users\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("admin-edit-save").click();
  await disabled;
  await page.goto("/admin/groups");
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "리더검증팀" }).getByTestId("group-leader-name")).toHaveText("미지정");
});

test("작성 제외 사용자: 로그인 시 작성 화면으로 안 보냄 + 작성 페이지 안내(직접 작성은 가능)", async ({ page, browser }) => {
  await login(page, "park.sora");
  const base = new URL(page.url()).origin;

  // 1) 직원 추가(소속 없음, 인증번호 2468)
  await page.goto("/admin/users");
  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("제외사원");
  await page.getByTestId("user-loginid").fill("excl.member");
  await page.getByTestId("user-group").selectOption("");
  await page.getByTestId("user-code").fill("2468");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/admin/users") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("add-user-submit").click();
  await created;

  // 2) 프로필에서 '작성 대상' 끄기
  await page.getByTestId("admin-user-search").fill("제외사원");
  await page.getByTestId("admin-user-row").filter({ hasText: "제외사원" }).getByRole("link", { name: "프로필" }).click();
  await expect(page).toHaveURL(/\/admin\/users\/\d+/);
  await page.getByTestId("report-required-toggle").click();
  const saved = page.waitForResponse((r) => /\/api\/admin\/users\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("profile-save").click();
  await saved;

  // 3) 격리 컨텍스트 로그인 → 작성(/report)이 아니라 목록(/reports)으로
  const ctx = await browser.newContext({ baseURL: base });
  const p = await ctx.newPage();
  await p.goto("/login");
  await p.locator("#login-id").fill("excl.member");
  for (let i = 0; i < 4; i++) await p.getByLabel(`인증번호 ${i + 1}번째 자리`).fill("2468"[i]);
  await p.getByRole("button", { name: "로그인" }).click();
  await p.waitForURL(/\/reports$/, { timeout: 10000 });

  // 4) 작성 페이지 직접 접근 시 자동 작성 화면이 아니라 안내
  const today = await p.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date()));
  await p.goto(`/report/${today}`);
  await expect(p.getByTestId("not-report-target")).toBeVisible();

  // 5) '그래도 작성하기' → 작성 에디터 진입
  await p.getByTestId("write-anyway").click();
  await expect(p.getByTestId("report-header")).toBeVisible();
  await ctx.close();
});

test("이메일 정책: 아이디가 이메일이면 그대로(이중 @ 방지) + 잘못된 형식 차단(서버 400·편집 차단)", async ({ page }) => {
  await login(page, "park.sora");
  await page.goto("/admin/users");

  // 1) 아이디가 이메일인데 이메일 미입력 → @company.com 덧붙이지 않고 그대로 도출
  await page.getByTestId("add-user-open").click();
  await page.getByTestId("user-name").fill("이메일아이디");
  await page.getByTestId("user-loginid").fill("emailid@wavle.io");
  await page.getByTestId("user-group").selectOption("");
  await page.getByTestId("add-user-submit").click();
  await expect(page.getByTestId("admin-users-table")).toContainText("이메일아이디");

  // 편집 모달에 도출된 이메일이 이중 @ 아님(emailid@wavle.io)
  await page.getByTestId("admin-user-search").fill("이메일아이디");
  await page.getByTestId("admin-user-row").filter({ hasText: "이메일아이디" }).getByRole("button", { name: "수정" }).click();
  await expect(page.getByTestId("admin-edit-email")).toHaveValue("emailid@wavle.io");

  // 잘못된 형식으로 저장 시도 → 클라 검증으로 차단(모달 유지)
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("admin-edit-email").fill("emailid@wavle.io@company.com");
  await page.getByTestId("admin-edit-save").click();
  await expect(page.getByTestId("admin-edit-modal")).toBeVisible();

  // 2) 서버단 검증: 잘못된 이메일 형식은 400
  const res = await page.request.post("/api/admin/users", { data: { name: "x", loginId: "bad.email.user", email: "not-an-email" } });
  expect(res.status()).toBe(400);
});

test("복수 그룹장: 한 사람을 여러 그룹의 그룹장으로 지정(기존 그룹장직 유지)", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await login(page, "park.sora");
  await page.goto("/admin/groups");

  // 그룹장 없는 새 그룹 생성
  await page.getByTestId("add-group-open").click();
  await page.getByTestId("group-name").fill("복수검증팀");
  const created = page.waitForResponse((r) => r.url().endsWith("/api/admin/groups") && r.request().method() === "POST" && r.ok());
  await page.getByTestId("group-create-submit").click();
  await created;

  // 복수검증팀 그룹장을 김도윤(개발팀 그룹장 겸 비구성원)으로 지정 — group_leader/admin 역할만 가능
  const card = page.getByTestId("admin-group-card").filter({ hasText: "복수검증팀" });
  await card.getByRole("button", { name: "수정" }).click();
  await page.getByTestId("group-edit-leader").selectOption({ label: "김도윤" });
  const saved = page.waitForResponse((r) => /\/api\/admin\/groups\/\d+$/.test(r.url()) && r.request().method() === "PATCH" && r.ok());
  await page.getByTestId("group-edit-save").click();
  await saved;

  // 복수검증팀·개발팀 둘 다 김도윤이 그룹장 — 개발팀 그룹장직이 해제되지 않음(복수 그룹장)
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "복수검증팀" }).getByTestId("group-leader-name")).toHaveText("김도윤");
  await expect(page.getByTestId("admin-group-card").filter({ hasText: "개발팀" }).getByTestId("group-leader-name")).toHaveText("김도윤");
});
