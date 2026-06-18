// 환경변수 접근 단일 지점. (Next.js는 .env.local 자동 로드, 스크립트는 scripts/_loadenv 사용)

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env: ${name}`);
  return v;
}

export const env = {
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  tz: process.env.TZ ?? "Asia/Seoul",
  sessionSecret: process.env.SESSION_SECRET ?? "dev-change-me-please",
  databaseUrl: req("DATABASE_URL", "postgresql://seeding:seeding@localhost:5432/seeding"),

  mail: {
    transport: (process.env.MAIL_TRANSPORT ?? "log") as "log" | "ncp",
    fromAddress: process.env.MAIL_FROM_ADDRESS ?? "no-reply@example.com",
    fromName: process.env.MAIL_FROM_NAME ?? "Seeding",
  },

  ncp: {
    accessKeyId: process.env.NCP_ACCESS_KEY_ID ?? "",
    secretKey: process.env.NCP_SECRET_KEY ?? "",
    domainVerification: process.env.NCP_MAILER_DOMAIN_VERIFICATION ?? "",
  },
} as const;

export const isProd = process.env.NODE_ENV === "production";

// 운영 런타임에서 약한 세션 시크릿이면 부팅 금지 (쿠키 위조 방지).
// 빌드 단계(phase-production-build)는 시크릿이 주입되지 않을 수 있으므로 제외.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (isProd && !isBuildPhase) {
  const s = process.env.SESSION_SECRET;
  if (!s || s === "dev-change-me-please" || s.length < 16) {
    throw new Error("SESSION_SECRET must be set to a strong value (>=16 chars) in production.");
  }
}
