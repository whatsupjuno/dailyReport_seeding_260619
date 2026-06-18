import { execSync } from "node:child_process";

/** 테스트 DB(seeding_test)를 매 실행마다 리셋 + 시드 → 결정적 e2e */
export default async function globalSetup() {
  const DATABASE_URL =
    process.env.TEST_DATABASE_URL ?? "postgresql://seeding:seeding@localhost:5432/seeding_test";
  const env = { ...process.env, DATABASE_URL };
  console.log("[e2e] resetting test DB:", DATABASE_URL);
  execSync("pnpm exec tsx scripts/migrate.ts --reset", { stdio: "inherit", env });
  execSync("pnpm exec tsx scripts/seed.ts", { stdio: "inherit", env });
}
