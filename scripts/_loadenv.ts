// 스크립트(tsx)에서 .env.local → .env 순으로 환경변수 로드
import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
for (const f of [".env.local", ".env"]) {
  const p = resolve(root, f);
  if (existsSync(p)) config({ path: p });
}
