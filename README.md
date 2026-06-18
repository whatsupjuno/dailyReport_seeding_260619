# Seeding · 일일 업무 보고 시스템

> What The Hell Are You Doing? — 팀원의 일일 업무 보고를 받고 그룹장이 검수하는 사내 웹 시스템.
> 업로드된 Claude Design HTML 시안을 기준으로 구현. **Next.js 15 + PostgreSQL** 풀스택.

## 빠른 시작

```bash
pnpm install

# PostgreSQL(로컬) 필요. .env.local의 DATABASE_URL 확인.
pnpm db:reset      # 스키마 생성 (DROP+재생성)
pnpm db:seed       # 데모 사용자/그룹/보고서 시드

pnpm dev           # http://localhost:3000
```

### 로그인 (현재: 고정 4자리 코드)
- 인증번호(고정): **1234** — *OTP 자동 발급은 추후 구현(현재 DB의 `users.login_code`)*
- 데모 계정:
  - `kim.doyun` — 그룹장(개발팀, 검수 가능)
  - `oh.serim` · `park.seojun` · `jung.yuna` — 직원
  - `park.sora` — 관리자(사용자/그룹 관리)

## 테스트

```bash
pnpm test          # Vitest 단위 (39)
pnpm test:e2e      # Playwright e2e (17) — seeding_test DB를 리셋·시드 후 실행
```
> e2e는 `seeding_test` DB와 로컬 PostgreSQL이 필요합니다(글로벌 셋업이 자동 리셋/시드).

## 화면
- **작성**: 상태 기반 모드(계획→오전→오후→야간), 업무 추가/개별 마감, 야간 분기, 휴가 전환, 커뮤니케이션 기록, 일일 코멘트, 임시저장
- **목록**: 관리자(팀 현황·통계)/직원(내 보고서)
- **검수**: 큐 + 상세(AI 분석 패널은 v1 예약) + 승인/반려(시간대 지목) → 재작성 → 재제출
- **관리**: 사용자/그룹·그룹장

## 아키텍처
- Next.js 15 App Router + TypeScript, Tailwind v4 + CSS 변수 토큰
- `pg`(node-postgres) + 원시 SQL 마이그레이션(`db/migrations`), 서버 권위 상태머신
- 쿠키 세션 인증(서명), RBAC(소유권/그룹장/관리자), KST 처리
- 메일러 추상화(`MailTransport`: Log/NCP HMAC) — 실발송/스케줄러는 미연결(아래 참조)

## 문서
- `docs/01~04` — 기능명세 / 데이터모델 / API매핑 / 백엔드자동화 (명세 워크플로 산출)
- `docs/VERIFICATION.md` — 적대적 검증 결과 & 수정 현황
- `STATUS.md` — 진행 상황

## 보안/운영 메모
- 시크릿은 `.env.local`(gitignore). 운영에선 `SESSION_SECRET`(≥16자) 필수(미설정 시 부팅 거부).
- 현재 고정 코드 인증 + 로그인 레이트리밋(20회/5분). **운영 전 OTP/메일 인증으로 전환 필요.**

## 추후(미구현)
자동 OTP·메일 발송/스케줄러(발송 cadence·리마인더·반려 안내·NCP 실발송), 어제 미완료 불러오기/반복/첨부, 야간 종료시각 정밀 + 10분전 재발송, 정성지표(효율성·연속성·연관성) AI 산출. 자세한 내용은 `docs/VERIFICATION.md`.
