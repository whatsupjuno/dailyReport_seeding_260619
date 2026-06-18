# Seeding 빌드 진행 상황 (자율 작업)

> 목표(/goal): 업로드된 "Seeding 업무보고 시스템" HTML 디자인의 서비스를 구현. **완성 즉시 실제 업무 사용 가능 + e2e/Playwright 전부 통과.**
> 사용자 부재(취침) 중 자율 진행. 완료 후 적대적 검증 수행.

## 아키텍처 결정
- **Next.js 15 (App Router) + TypeScript**, `src/` 구조, **pnpm**.
- **스타일**: Tailwind v4 + CSS 변수 디자인 토큰(아티팩트의 팔레트/상태색 그대로). 반응형 분기 720px(pc-only/sm-only).
- **DB**: PostgreSQL 17(로컬). `pg`(node-postgres) Pool + `db/migrations/*.sql` 원시 SQL 마이그레이션 + 얇은 타입드 쿼리 헬퍼. (ORM 미사용 — 명세 DDL과 1:1)
- **인증**: 아이디 + 메일 OTP 4자리 → 서명 쿠키 세션(sessions 테이블). dev/test에선 `MAIL_TRANSPORT=log`라 OTP를 로그/DB에서 취득해 Playwright 로그인.
- **메일러**: `MailTransport` 인터페이스 — `LogTransport`(기본) / `NcpTransport`(HMAC 서명, `MAIL_TRANSPORT=ncp`일 때만 실제 발송). 테스트는 실제 발송 안 함.
- **스케줄러**: 발송/리마인더 로직은 순수 함수 + tick 엔드포인트로 구현·단위테스트. 실제 cron은 cafe24 linux용으로 문서화. 테스트 중 실제 발송/스팸 없음.
- **테스트**: Playwright e2e(인증·작성 흐름·목록·검수 승인/반려·관리) against `seeding_test` + 시드. Vitest 단위(상태전이·리마인더·완결/지연 계산).

## 환경
- 로컬 PG: `postgresql://seeding:seeding@localhost:5432/seeding` (+ `seeding_test`). 롤 `seeding`.
- git: `origin = github.com/whatsupjuno/dailyReport_seeding_260619`. 시크릿은 `.env.local`(gitignore).
- NCP Outbound Mailer 키 보유(.env.local). docker 데몬 off → 로컬 PG 사용.

## 진행 체크리스트
- [x] 워크스페이스/툴체인/DB/git 셋업
- [x] 명세 4종 워크플로 → `docs/`(영문enum·2축 설계; 구현은 한글enum·단일status로 단순화 — 구현이 진실원천)
- [x] Next.js 스캐폴드 + 디자인 토큰
- [x] DB 마이그레이션(0001·0002) + 시드
- [x] 인증: 아이디 + **고정 4자리 코드(DB)** + 서명쿠키 세션 (OTP 자동발급은 추후)
- [x] 작성 화면: 상태기반 모드(계획→오전→오후→야간), 업무 추가/마감, 야간 분기, 휴가 전환, 일일코멘트 + API
- [x] 목록: 관리자(팀 현황·통계)/직원(내 보고서) + 집계
- [x] 검수: 큐 + 상세(AI패널 v1 placeholder·이력) + 승인/반려(시간대 지목)→재작성→재제출 + API
- [x] 관리: 사용자 목록·추가, 그룹·그룹장 + API
- [x] **Playwright e2e 13 + Vitest 23 전부 통과**
- [~] 적대적 검증(보안/RBAC/상태머신/SQL/누락/테스트) — 워크플로 실행 중 → 확정 이슈 수정 예정
- [ ] (추후) 메일 실발송/스케줄러 연결, 커뮤니케이션 추가 UI, 첨부, 임시저장

## 실행 방법
- 의존성: `pnpm install`  · DB: `pnpm db:reset && pnpm db:seed`  · 개발: `pnpm dev`(3000)
- 단위: `pnpm test`  · e2e: `pnpm test:e2e`  (둘 다 로컬 PostgreSQL 필요)
- 로그인: 시드 사용자(kim.doyun/그룹장, park.sora/관리자, oh.serim/직원 등) + 고정코드 **1234**

## 🚀 배포 (라이브)
- **http://58.229.163.104** — systemd `seeding.service`(포트 80), 같은 서버 기존 앱 agentnews와 격리 공존
- DB: agentnews-postgres 컨테이너 내 별도 `seeding` DB / 메일: NCP 실발송(no-reply@wavle.io) 검증
- 자동 발송 cron(평일 KST 08:30/11:50/17:50) — 08:30에 Sales 팀 전원 발송. 상세 `deploy/DEPLOY.md`
- 운영 사용자: 방준호(juno@wavle.io/5660·그룹장)·박정빈(jb@wavle.io/7815)·강진현(jhkang@wavle.io/4942)

## ➕ 추가 구현 (2차)
구현: #1 업무 첨부파일·URL, #2 어제 미완료 불러오기·최근 업무 자동완성·반복 업무, #5 목록 상태 탭+기간/팀/검색 필터, #6 검수 큐 이전/다음 네비, #9 스키마 무결성 CHECK(소요시간/첨부종류/섹션-보고서 교차FK/커뮤 필수). 단위 39 + e2e 21 통과, 서버 배포·검증 완료.
미진행(요청대로 보류): #3 강제 마감, #4 개인 프로필 변경, #7 야간 종료시각+미작성 리마인더, #8 정성지표 AI, 자동 OTP(고정코드 유지).
