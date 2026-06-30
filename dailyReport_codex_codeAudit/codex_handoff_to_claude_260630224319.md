# Claude Code 인수인계 문서 260630224319

## 결론 요약

판정: 수정 불필요.

Codex가 진행한 non-P0 감사 수정 PR은 `main`에 병합했고, 운영 서버 `/opt/apps/seeding`에 배포했다. 배포 후 `seeding.service`는 `active`, `/login`은 `HTTP 200 OK`로 확인됐다.

Claude Code가 즉시 확인할 항목은 3개다.

1. 댓글/대댓글 등록 무반응 재현 여부: 배포 후 수동 실사용 확인.
2. 기존 CSS warning: `src/app/globals.css`의 `@import` 순서 경고는 이번 범위에서 수정하지 않았다.
3. P0 운영 안전선: 사용자 지시로 이번 PR과 배포 범위에서 제외했다. 별도 협의 후 처리해야 한다.

## 범위와 제외 조건

### 이번에 처리한 범위

- 보안: OTP 제외, 댓글 멘션 수신자 범위 제한, ID 검증, malformed body 400 처리, self-review 권한 분리.
- 정합성: 제출 후 잠금 정책, 첨부/커뮤니케이션 삭제 경합 차단, 그룹장 지정 invariant와 lock order 보강.
- YAGNI: outbox/dedup migration, 검색 고도화, revision 증적화, P0 운영 안전선은 이번 변경에 넣지 않았다.
- 댓글 등록 무반응: 클라이언트 권한 기준과 서버 권한 기준 불일치, NCP 알림 발송 대기 문제를 함께 닫았다.

### 명시 제외

- P0 운영 안전: TLS, Secure cookie 강제, root 실행 제거, 업로드 디렉터리 분리, 배포 백업 절차.
- OTP 영역: 사용자가 허용한 테스트 운영 조건으로 제외.
- 문맥 검색: 아직 미개발 기능이라 no-op이 정상으로 판단.
- 운영 DB 직접 수동 수정: 이번 배포에서 직접 SQL 수정은 하지 않았다.
- 기존 untracked 문서: `docs/seeding-v5.0.9-수정구현계획.md`는 포함하지 않았다.
- `.claude/` worktree 산출물: 포함하지 않았다.

## GitHub 및 병합 정보

- Repository: `whatsupjuno/dailyReport_seeding_260619`
- PR: https://github.com/whatsupjuno/dailyReport_seeding_260619/pull/1
- PR title: `[codex] Fix non-P0 audit findings`
- Base: `main`
- Head: `codex/audit-fixes-260630`
- Draft 해제: Codex가 `gh pr ready 1` 실행.
- 병합 방식: GitHub PR 일반 merge.
- Merge 시각: `2026-06-30 22:34:45 KST`
- Merge commit: `1820611e85e92b9b799e06c9840650bb00715c08`
- 병합 전 main 최신 commit: `93e42ca`
- 병합 직전 PR branch 최신 commit: `a54723e`

PR branch 주요 commit:

1. `418f2a0` - 댓글 등록 무반응 1차 수정: NCP 알림 발송을 fire-and-forget 처리.
2. `cde384a` - 댓글 등록 무반응 추가 수정: 클라이언트 `canMutate` 기준 보강, 입력 검증/프로젝트 폼 강화.
3. `6e2a580` - 댓글 권한 불일치 수정 보강.
4. `c3a89ba` - non-P0 감사 잔여 항목 수정.
5. `6380a58` - 완료보고서에 PR 링크 추가.
6. `a54723e` - `origin/main` 병합 충돌 해결.
7. `1820611` - PR #1 merge commit.

## 배포 정보

- 배포 서버: `58.229.163.104`
- 배포 경로: `/opt/apps/seeding`
- systemd service: `seeding.service`
- 배포 기준 commit: `main@1820611`
- 배포 완료 확인 시각: `2026-06-30 22:43 KST`
- 서비스 재시작 시각: `2026-06-30 22:42:49 KST`
- Next ready 로그: `2026-06-30 22:42:51 KST`
- 배포 후 HTTP 확인: `curl -I http://58.229.163.104/login` -> `HTTP/1.1 200 OK`

배포 명령 흐름:

```bash
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  ./ root@58.229.163.104:/opt/apps/seeding/

cd /opt/apps/seeding
pnpm install --no-frozen-lockfile
pnpm rebuild esbuild sharp @tailwindcss/oxide
node_modules/.bin/tsx scripts/migrate.ts
node_modules/.bin/tsx scripts/seed-prod.ts
NODE_ENV=production node_modules/.bin/next build
systemctl restart seeding
systemctl is-active seeding
```

서버 배포 결과:

- `pnpm install --no-frozen-lockfile`: 성공.
- `pnpm rebuild esbuild sharp @tailwindcss/oxide`: 성공.
- `scripts/migrate.ts`: 성공, 신규 migration `0`건.
- `scripts/seed-prod.ts`: 성공, `Sales group + 3 users upserted`.
- `next build`: 성공.
- `systemctl restart seeding`: 성공.
- `systemctl is-active seeding`: `active`.
- `journalctl -u seeding --since "5 minutes ago"`: 재시작 및 Ready 로그 확인, 즉시 오류 없음.

주의:

- 배포 중 비밀번호는 문서와 로그에 남기지 않았다.
- 원격 build에서도 CSS warning 1건이 발생했다. 빌드 실패로 이어지지 않았다.
- 서버는 `root`로 운영 중이다. 이는 P0 운영 안전 범위에 속하므로 이번 변경에서는 손대지 않았다.

## 검증 결과

병합된 `main@1820611` 기준 로컬 검증:

```bash
pnpm install --frozen-lockfile
./node_modules/.bin/tsc --noEmit --pretty false
./node_modules/.bin/vitest run
NODE_ENV=production ./node_modules/.bin/next build
./node_modules/.bin/playwright test \
  tests/e2e/security.spec.ts \
  tests/e2e/comments.spec.ts \
  tests/e2e/comment-advanced.spec.ts \
  tests/e2e/comment-notify.spec.ts
```

결과:

- TypeScript: 통과.
- Vitest: `10` files, `106` tests 통과.
- Next production build: 통과.
- Playwright 선별 E2E: `20` tests 통과.
- CSS warning: `@import rules must precede all rules aside from @charset and @layer statements` 1건. 기존 warning이며 이번 범위에서 수정하지 않았다.

PR branch에서 병합 전 추가로 확인했던 결과:

- `git diff --check`: 통과.
- `./node_modules/.bin/playwright test tests/e2e/security.spec.ts`: `10` tests 통과.
- `./node_modules/.bin/playwright test`: `67` tests 통과.
- `./node_modules/.bin/next build`: 통과.

## 수정 상세

### 1. 댓글/대댓글 등록 무반응

파일:

- `src/app/api/tasks/[id]/comments/route.ts`
- `src/components/report/CommentDrawer.tsx`

처리:

- 댓글 생성 API에서 `notifyComment(...)`를 응답 전에 기다리지 않도록 `fire-and-forget` 처리했다.
- NCP 실발송 지연 또는 실패가 댓글 등록 응답을 막지 않게 했다.
- 알림 실패는 `console.error`로만 기록하고 댓글 작성 자체는 성공 응답을 반환한다.
- 클라이언트의 `canMutate` 기준을 서버 `commentAccess(...).canWrite`와 맞췄다.
- 검수권자/admin에게 composer는 보이지만 POST는 막히는 권한 불일치를 닫았다.

Claude Code 확인 포인트:

- 운영 UI에서 최상위 댓글 등록 후 즉시 목록 반영 여부.
- 대댓글 등록 후 부모 댓글 아래 중첩 표시 여부.
- NCP 장애 또는 지연 시 댓글 작성 응답이 지연되지 않는지.

### 2. 댓글 멘션 수신자 범위 제한

파일:

- `src/lib/data/comments.ts`
- `src/lib/mail/notify.ts`
- `src/app/api/comments/members/route.ts`
- `src/components/report/CommentDrawer.tsx`
- `tests/e2e/security.spec.ts`

처리:

- 멘션 후보 API가 `taskId`를 필수로 받고, 해당 task/report에 댓글 접근권이 있는 사용자에게만 후보를 반환하게 했다.
- 서버 멘션 해석도 `reportId` 기준 접근권자 범위 안에서만 수행한다.
- 메일 발송 직전에도 `allowedCommentRecipientIds(reportId)`로 수신자를 재검증한다.
- 접근권 없는 활성 사용자가 `@멘션` 문자열로 알림 수신자로 승격되지 않도록 막았다.

Claude Code 확인 포인트:

- 보고서와 무관한 active 사용자 멘션 시 알림 생성 여부가 없어야 한다.
- 댓글 후보 목록이 task/report 권한 밖 사용자를 노출하지 않아야 한다.

### 3. Admin project/group 입력 검증

파일:

- `src/app/api/admin/projects/route.ts`
- `src/app/api/admin/projects/[id]/route.ts`
- `src/app/api/admin/groups/route.ts`
- `src/app/api/admin/groups/[id]/route.ts`
- `src/app/api/admin/groups/body.ts`
- `src/lib/data/projects.ts`
- `tests/e2e/security.spec.ts`
- `tests/e2e/projects.spec.ts`
- `tests/e2e/admin.spec.ts`

처리:

- malformed body는 500이 아니라 400으로 차단한다.
- `ownerUserId`는 safe integer 양수로 검증한다.
- 그룹 body parser를 별도 파일로 분리해 create/update 경로 검증을 통일했다.
- 그룹장 지정 가능 사용자는 active `group_leader` 또는 `admin`으로 제한했다.

Claude Code 확인 포인트:

- 운영에서 기존 invalid group leader 데이터가 있는지 확인 필요. 이번 PR은 신규/수정 경로를 막지만 과거 데이터 일괄 백필은 하지 않았다.

### 4. 그룹장/사용자 변경 동시성

파일:

- `src/lib/data/admin.ts`
- `tests/e2e/security.spec.ts`

처리:

- 그룹장 지정 시 `assertAssignableLeader(input.leaderId, c)`를 먼저 수행하고 이후 group row를 lock한다.
- 사용자 변경 경로에서 대상 user row를 `FOR UPDATE`로 lock한다.
- group patch와 user demotion 경합 시 deadlock/500 없이 종료되는지 E2E를 추가했다.

Claude Code 확인 포인트:

- 동시 운영 변경이 많은 시간대에 admin group/user 변경 로그 확인.

### 5. 검수 권한과 self-review 제한

파일:

- `src/lib/data/review.ts`
- `src/components/review/ReviewDetail.tsx`
- `src/app/(app)/review/[id]/page.tsx`
- `tests/unit/review-auth.test.ts`
- `tests/e2e/self-review.spec.ts`

처리:

- self-review fallback은 admin 권한 경로와 일반 reviewer 권한 경로를 분리했다.
- self row reject는 별도 `canRowReject` 기준으로 막았다.
- 검수 화면이 서버 권한과 같은 판단을 하도록 보강했다.

Claude Code 확인 포인트:

- admin self-approval 허용 범위와 일반 사용자의 self row reject 차단 정책이 제품 의도와 맞는지 최종 확인.

### 6. 제출 후 잠금 정책과 상태 정합성

파일:

- `src/lib/domain/status.ts`
- `src/lib/domain/mode.ts`
- `src/lib/domain/report.ts`
- `src/lib/data/report-mutations.ts`
- `src/components/report/ReportEditor.tsx`
- `tests/unit/mode.test.ts`
- `tests/e2e/write.spec.ts`
- `tests/e2e/leave.spec.ts`

처리:

- `검수대기`를 `FINAL_LOCKED`에 포함해 제출 이후 작성자 변경을 막았다.
- 화면 mode 계산도 `검수대기`를 view mode로 맞췄다.
- 휴가 상태와 제출 상태가 섞인 경우 서버 거부와 UI 노출이 어긋나지 않게 했다.
- 커뮤니케이션 삭제 경로에서 `FOR UPDATE OF r`로 report row를 lock한다.

Claude Code 확인 포인트:

- 사용자가 제출 직후 브라우저 탭 2개로 업무/커뮤니케이션/첨부 변경을 시도하는 실제 경합 케이스.

### 7. 첨부 변경 경합

파일:

- `src/lib/data/attachments.ts`
- `tests/e2e/security.spec.ts`

처리:

- 업무 첨부와 커뮤니케이션 첨부 변경 경로에서 report row lock을 잡아 제출 전환 경합을 차단했다.
- DB row lock 중심의 최소 변경으로 처리했고, 파일시스템 업로드와 DB transaction의 완전 원자성 보상 삭제는 이번 범위에 넣지 않았다.

Claude Code 확인 포인트:

- 파일 업로드 중 제출 전환이 발생하는 실사용 케이스.
- 파일시스템 orphan cleanup은 별도 과제로 남아 있다.

### 8. NCP 메일 timeout

파일:

- `src/lib/mail/ncp.ts`
- `tests/unit/ncp-mail.test.ts`

처리:

- NCP fetch에 `AbortController` 기반 5초 timeout을 추가했다.
- timeout 시 `ok:false`와 error를 반환하도록 했다.
- 기존 호출부가 메일 발송 실패로 핵심 업무 처리를 막지 않게 했다.

Claude Code 확인 포인트:

- 실제 NCP 장애 시 로그 포맷과 운영 알림 방식.
- outbox/retry/dedup은 이번 YAGNI 판단으로 제외했다.

### 9. 보고서 목록 query와 React key

파일:

- `src/app/(app)/reports/page.tsx`
- `tests/e2e/security.spec.ts`

처리:

- 중복 query와 비정규 `group` 필터가 500 또는 전체조회 확장으로 이어지지 않게 했다.
- 목록 key를 안정적인 식별자 기준으로 보강했다.

Claude Code 확인 포인트:

- 대량 데이터 pagination과 SQL 최적화는 이번 범위 밖이다.

### 10. 테스트/워크스페이스 보강

파일:

- `package.json`
- `pnpm-workspace.yaml`
- `playwright.config.ts`
- `tests/unit/*`
- `tests/e2e/*`

처리:

- `pnpm-workspace.yaml`을 추가했다.
- pnpm build allow 설정을 추가했다.
- Playwright webServer 재사용 관련 테스트 재현성을 보강했다.
- 변경 범위에 맞춘 unit/E2E negative test를 추가했다.

## 작성된 보고서

1. `dailyReport_codex_codeAudit/codex_audit_report_260630181619.md`
2. `dailyReport_codex_codeAudit/codex_fix_plan_260630182707.md`
3. `dailyReport_codex_codeAudit/codex_completion_report_260630193933.md`
4. `dailyReport_codex_codeAudit/codex_handoff_to_claude_260630224319.md`

## 서브에이전트 감사/개발 흐름

완료보고서 기준 진행 기록:

- 계획 감사: 3개 격리 세션 수행 후 계획 보강.
- 개발 병렬 작업: 4개 격리 세션으로 영역별 수정 후 통합.
- 개발 감사 1차: 5개 격리 세션. 그룹장 invariant, self row reject, attachment race, domain mode, malformed body, E2E 재현성, admin comment 권한 문제 확인.
- 개발 감사 2차: 3개 격리 세션. `deleteCommunication` row lock, 댓글 멘션 수신자 범위, 그룹 body 검증, 그룹장 동시성 문제 확인.
- 개발 감사 3차: 3개 격리 세션. lock order 역전과 멘션 테스트 관측 약점 확인.
- 개발 감사 4차: 2개 격리 세션. 최종 판정 2건 모두 `수정 불필요`.

## 잔여 리스크

1. P0 운영 안전은 미해결 상태다. 이번 사용자의 지시로 제외했지만 운영 장기화 전에는 별도 PR이 필요하다.
2. OTP 영역은 테스트 운영 조건으로 허용됐으나, 실제 운영 전에는 고정 코드/OTP 정책을 재검토해야 한다.
3. 파일시스템 업로드와 DB transaction의 완전 원자성 보상 삭제는 남아 있다.
4. 운영 DB의 과거 invalid leader 데이터 백필은 하지 않았다.
5. NCP 알림은 timeout까지만 적용했다. retry/outbox/dedup 원장화는 별도 설계가 필요하다.
6. CSS `@import` 순서 warning은 기존 warning으로 남아 있다.
7. 서버가 root/systemd로 실행 중이다. 이는 이번 범위 밖이지만 운영 안전 리스크다.

## 롤백 기준과 절차

롤백 기준:

- 댓글 작성 또는 대댓글 작성이 운영에서 다시 무응답으로 재현된다.
- 검수/제출 경로에서 500이 반복 발생한다.
- `seeding.service`가 restart 후 1분 안에 반복 종료된다.
- `/login` 또는 핵심 인증 API가 5xx를 반환한다.

코드 롤백 기준 commit:

- 직전 main commit: `93e42ca`
- 이번 merge commit: `1820611`

코드 롤백 절차:

```bash
git checkout 93e42ca
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '.env*' \
  ./ root@58.229.163.104:/opt/apps/seeding/
ssh root@58.229.163.104
cd /opt/apps/seeding
pnpm install --no-frozen-lockfile
pnpm rebuild esbuild sharp @tailwindcss/oxide
NODE_ENV=production node_modules/.bin/next build
systemctl restart seeding
systemctl is-active seeding
```

DB 관련:

- 이번 배포에서 신규 migration은 `0`건이었다.
- `seed-prod`는 upsert를 수행했다.
- 별도 DB rollback SQL은 작성하지 않았다.

## Claude Code 권장 다음 행동

1. 운영 브라우저에서 댓글 작성, 대댓글 작성, 멘션 후보, 멘션 알림을 수동 확인한다.
2. `journalctl -u seeding --since "2026-06-30 22:42:49"`로 배포 후 10분 이상 오류 로그를 확인한다.
3. P0 운영 안전 항목을 별도 PR로 분리해 협의한다.
4. invalid leader 과거 데이터가 있는지 운영 DB에서 조회하고, 있으면 별도 백필/정리 계획을 세운다.
5. CSS `@import` warning은 낮은 우선순위로 별도 수정한다.

## 최종 결론

Codex 작업분은 PR 병합과 운영 배포까지 완료됐다. Claude Code는 이 문서의 검증 결과와 잔여 리스크를 기준으로 운영 수동 확인, 로그 모니터링, P0 별도 처리 여부를 결정하면 된다.
