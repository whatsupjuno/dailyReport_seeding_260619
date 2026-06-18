import { defineConfig, devices } from "@playwright/test";

const PORT = 3100; // 테스트 전용 포트 (dev 3000과 분리)
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? "github" : [["list"], ["html", { open: "never" }]],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./tests/e2e/global-setup.ts",
  webServer: {
    // 테스트 DB로 앱을 띄움. DB 리셋/시드는 globalSetup에서 수행.
    command: `pnpm exec next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://seeding:seeding@localhost:5432/seeding_test",
      MAIL_TRANSPORT: "log",
      PORT: String(PORT),
      APP_BASE_URL: BASE_URL,
    },
  },
});
