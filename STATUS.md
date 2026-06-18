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
- [~] 명세 4종 워크플로(스키마·기능·API·백엔드) — 백그라운드 실행 중
- [ ] docs/ 저장 + 검증 요약
- [ ] Next.js 스캐폴드 + 디자인 토큰 + 공통 컴포넌트
- [ ] DB 마이그레이션 + 시드
- [ ] 인증(아이디+OTP+세션)
- [ ] 작성 화면(7모드) + API
- [ ] 목록(관리자/직원) + API
- [ ] 검수(승인/반려/이력) + API
- [ ] 관리(사용자/그룹) + API
- [ ] 메일러 + 스케줄러/리마인더
- [ ] Playwright e2e + Vitest 통과
- [ ] 적대적 검증(정확성/보안/RBAC/테스트 충분성) 리포트
