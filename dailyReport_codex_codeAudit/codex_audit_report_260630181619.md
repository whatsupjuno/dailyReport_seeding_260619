# Seeding 코드 감사 보고서

- 파일명: `codex_audit_report_260630181619.md`
- 작성 시각: 2026-06-30 18:16:19 KST
- 대상 저장소: `/Users/whatsupjuno/WTF/dailyReport_seeding`
- 감사 방식: 메인 에이전트 직접 감사 + 10개 페르소나 서브에이전트 감사
- 운영 확인 범위: 서버/DB 읽기 전용 확인만 수행
- 제외 항목: OTP/고정 코드 인증 방식, 미개발 문맥 검색 기능, P0 운영 안전선 항목

## 1. 결론 요약

판정: 수정 후 진행.

현재 시스템은 핵심 업무 흐름, DB 제약, 기본 권한 체크, 테스트 커버리지가 이미 갖춰져 있다. P0 운영 안전선 항목은 Claude Code 쪽 감사·수정과 상호 협의 후 별도 진행한다. 이번 보고서의 즉시 조치 범위는 검수 권한 fallback, 제출 후 수정 정책, 알림 원장/중복 방지, 목록·검색 성능이다.

이번 턴 기준 즉시 필요한 조치는 다음 4개다.

1. `authorizeReview()`의 self-review fallback에 허용 role과 조건을 명시한다.
2. `검수대기` 이후 수정 가능 정책을 확정하고 revision 원장 또는 서버 잠금을 구현한다.
3. 알림은 `dedup_key`, queued/outbox, timeout, retry 정책으로 전환한다.
4. `/reports` 목록 필터·정렬·페이지네이션과 업무 검색을 SQL 스코프로 내리고 검색 인덱스를 추가한다.

## 2. 감사 범위와 검증 결과

### 수행한 확인

- 로컬 단위 테스트: `vitest run` 102/102 통과
- 타입 검사: `tsc --noEmit` 통과
- 빌드: `next build` 통과
- E2E: Playwright 62/62 통과
- 로컬/운영 DB migration 최신 상태 비교
- 운영 서버 systemd 상태 읽기
- 운영 HTTP/HTTPS 응답 읽기
- 운영 DB row count, session, notification 상태 읽기
- 10개 페르소나 서브에이전트 병렬 감사

### 운영 DB 읽기 결과

- 로컬/운영 DB 모두 최신 migration: `0023_comment_notification_kinds.sql`
- public table: 19개
- constraint: 68개
- index: 45개
- 운영 주요 row 추정: users 8, reports 44, tasks 386, comments 10, notifications 199
- 운영 sessions: total 1413, expired 11
- 운영 notifications: 일부 `failed` 누적 존재
- HTTPS probe: timeout
- HTTP probe: `/login` redirect 확인

## 3. 시스템 장점

### 보안·권한

- 세션 토큰은 랜덤값과 HMAC 서명으로 보호된다.
- 세션 조회 시 비활성 사용자면 잔존 세션을 삭제한다.
- API path ID는 다수 라우트에서 `parseId()`로 정규 10진수 양의 정수만 허용한다.
- 주요 task/report mutation은 owner 또는 reviewer 관계를 DB에서 확인한다.
- 승인/반려는 `FOR UPDATE` 후 `검수대기` 상태만 전이한다.
- SQL은 대부분 파라미터 바인딩을 사용한다.
- 메일 템플릿은 사용자 입력 HTML escape를 수행한다.
- 첨부 다운로드는 다운로드 시점에 인가를 재확인한다.

### DB 정합성

- `daily_reports(user_id, report_date)` unique로 중복 보고서를 방지한다.
- `tasks(section_id, report_id)` 복합 FK로 다른 보고서의 section 참조를 막는다.
- `task_comments(task_id, report_id)`와 `task_rejections(task_id, report_id)`도 보고서 소속을 강제한다.
- `tasks_completed_at_chk`가 완료 계열 상태와 `completed_at` 존재 여부를 묶는다.
- 미해소 행 반려는 task당 1건으로 제한한다.
- 휴가 필수 사유 CHECK와 백필 로그가 존재한다.

### 구조·테스트

- 보고서 상태와 작성 모드를 `computeWriteMode()`로 중앙화했다.
- 댓글 수신자 계산은 순수 함수로 분리되어 테스트가 쉽다.
- E2E는 전용 `seeding_test` DB를 reset/seed한다.
- Playwright는 KST locale/timezone과 단일 worker로 결정성을 우선한다.
- 작성, 검수, 반려, 댓글, 알림, admin, project, 기본 보안 시나리오가 E2E에 포함되어 있다.

## 4. 주요 개선점

### 이번 턴 제외: P0 운영 안전선

P0 운영 안전선 항목은 이번 턴의 실행·수정 대상에서 제외한다. 해당 항목은 Claude Code 쪽 감사·수정 결과와 상호 협의한 뒤 별도 계획으로 처리한다.

### P1. self-review fallback 권한 과다

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/review.ts:63`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reviews/[id]/approve/route.ts:15`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reviews/[id]/reject/route.ts:18`
- 현상: 본인 보고서이면 사용자 `role` 제한 없이 `ownerHasOtherReviewer()` 결과만 보고 self-review를 허용한다.
- 영향: 그룹장 부재, 비활성 그룹장, 본인 leader 상태에서 일반 직원도 직접 API 호출로 승인/반려할 수 있다.
- 수정안:
  1. self-review fallback 허용 role을 명시한다.
  2. 액션 권한 함수와 열람 권한 함수를 분리한다.
  3. employee role 사용자가 `leader_user_id`로 지정될 수 있는 정책을 확정한다.
- 사이드 이펙트: 기존 테스트 fixture 중 self-review 기대값을 조정해야 한다.

### P1. 댓글 멘션 정보 유출 가능성

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/comments.ts:84`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/comments.ts:95`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/mail/notify.ts:154`
- 현상: 멘션 후보와 멘션 해석이 활성 사용자 전체를 대상으로 한다.
- 영향: 접근권 없는 사용자에게 업무명, 작성자명, 댓글 발췌가 메일로 갈 수 있다.
- 수정안:
  1. 멘션 후보를 보고서 owner, 실제 검수자, 같은 그룹 사용자로 제한한다.
  2. 메일 전송 직전에도 수신자별 열람권을 재검증한다.
  3. 전사 멘션이 필요하면 별도 협업자 권한 모델을 둔다.
- 사이드 이펙트: 기존 전사 멘션 UX가 줄어든다.

### P1. CSRF 공통 방어 부재

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/auth/api.ts:5`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reviews/[id]/approve/route.ts:7`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reports/[id]/advance/route.ts:8`
- 현상: 상태 변경 API가 쿠키 세션만 확인하고 `Origin`, `Referer`, CSRF token을 공통 검증하지 않는다.
- 영향: 같은 site 오구성 또는 단순 POST 엔드포인트에서 의도치 않은 상태 변경 가능성이 남는다.
- 수정안:
  1. 모든 `POST/PATCH/DELETE`에 `assertSameOriginOrCsrf(req)` 적용
  2. `Origin` allowlist와 CSRF token 조합
  3. `Content-Type: application/json` 강제
- 사이드 이펙트: 클라이언트 fetch에 CSRF header 추가가 필요하다.

### P1. 제출 후 수정 정책과 감사 증적 불일치

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/domain/mode.ts:14`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:27`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:273`
- 현상: `검수대기` 제출 후에도 업무 추가·수정·마감, 커뮤니케이션, 첨부가 가능하다. 그러나 제출본 snapshot, revision event, 재알림은 없다.
- 영향: 검수자가 본 내용과 승인된 내용이 달라질 수 있고, 변경 증적이 부족하다.
- 수정안:
  1. 정책 A: `검수대기` 이후 작성자 편집 차단
  2. 정책 B: 편집 허용 시 `report_revision_events`와 재검수 알림 도입
  3. UI 문구를 정책과 일치시킨다.
- 사이드 이펙트: 정책 A는 사용 편의가 줄고, 정책 B는 테이블·알림·테스트 추가가 필요하다.

### P1. 자동 이월과 수동 이월 기준 불일치

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:411`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:465`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:518`
- 현상: 자동 이월은 `완결`, `지연`을 제외하지만 수동 후보는 `완결`만 제외한다.
- 영향: `지연` 상태 업무가 수동 이월에만 다시 등장할 수 있다.
- 수정안: 미완료 정의를 하나의 상수 또는 SQL fragment로 통일한다.
- 사이드 이펙트: 기존 사용자가 `지연`을 재작업 대상으로 기대했다면 상태 의미를 다시 합의해야 한다.

### P1. 알림 원장과 실제 발송 불일치 가능성

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/db/migrations/0001_init.sql:161`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/mail/notify.ts:20`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/scripts/dispatch.ts:152`
- 현상: `notifications`에 `dedup_key`와 unique 제약이 없다. 발송 후 INSERT 구조라 중복 실행, 프로세스 종료, DB insert 실패에 취약하다.
- 영향: 중복 메일, 발송됐지만 원장 없음, 원장은 있는데 실제 미발송인 상태가 생길 수 있다.
- 수정안:
  1. `dedup_key` unique 추가
  2. `queued` row를 먼저 claim
  3. send 결과를 UPDATE
  4. retry/backoff 정책 추가
- 사이드 이펙트: `submit_nag`는 반복 발송이 의도된 기능이므로 dedup key에 회차 또는 시간 bucket이 필요하다.

### P1. NCP 메일 timeout 부재

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/mail/ncp.ts:47`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reports/[id]/advance/route.ts:25`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/reviews/[id]/approve/route.ts:17`
- 현상: NCP `fetch`에 timeout이 없다. 승인·제출 라우트는 상태 변경 후 일부 알림을 await한다.
- 영향: 외부 메일 API 지연이 사용자 요청 지연으로 이어진다.
- 수정안:
  1. `AbortController`로 5초 내외 timeout 적용
  2. timeout은 `failed`로 기록
  3. retry queue로 재시도
- 사이드 이펙트: 느린 NCP 응답은 빠르게 실패 처리되므로 재시도 정책이 필수다.

### P1. fresh DB 배포 시 그룹 시간정책 누락 가능성

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/scripts/seed-prod.ts:13`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/db/migrations/0018_group_time_policy.sql:23`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/db/migrations/0020_group_invite_time.sql:6`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/scripts/dispatch.ts:75`
- 현상: 배포 순서는 migrate 후 seed-prod인데, `seed-prod`는 `Sales`를 이름만 insert한다. migration backfill은 마이그레이션 시점에 그룹이 이미 있어야 적용된다.
- 영향: fresh DB에서 `invite_at`, `submit_due`가 NULL이면 작성요청과 자동제출이 스킵될 수 있다.
- 수정안:
  1. `seed-prod`에서 기본 시간정책을 NULL일 때만 보정
  2. 운영에서 의도적으로 끈 값은 덮지 않음
  3. 배포 후 `groups` 정책 확인 쿼리 추가
- 사이드 이펙트: 무조건 UPDATE하면 관리자가 의도적으로 꺼둔 자동제출이 되살아날 수 있다.

### P2. `/reports` 입력 검증 불일치

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/reports/page.tsx:98`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/list.ts:57`
- 현상: admin group filter가 `parseId()` 대신 `Number(sp.group)`를 사용한다.
- 영향: `NaN`, `0x10`, `1e3`, `1.5` 같은 값이 DB bigint cast 오류나 의도치 않은 group id로 바뀔 수 있다.
- 수정안: query/body/path ID는 전부 `parseId(String(value))`로 통일한다.
- 사이드 이펙트: 잘못된 URL은 기존처럼 조용히 무시되지 않고 400 또는 명시 오류가 된다.

### P2. 프로젝트 API runtime validation 부족

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/admin/projects/route.ts:31`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/admin/projects/[id]/route.ts:22`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/projects.ts:64`
- 현상: `ownerUserId`의 runtime validation이 약하다.
- 영향: 잘못된 값이 DB bigint cast 오류로 이어질 수 있다.
- 수정안: `Number.isSafeInteger`, 양수 조건, 존재 사용자 검증을 route와 data layer 양쪽에 둔다.
- 사이드 이펙트: API 클라이언트가 기존에 보내던 느슨한 값은 실패한다.

### P2. 댓글 GET이 읽음 상태를 변경

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/tasks/[id]/comments/route.ts:17`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/api/tasks/[id]/comments/route.ts:27`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/comments.ts:200`
- 현상: 댓글 조회 `GET`이 `markCommentsRead()`를 호출한다.
- 영향: 링크 유도나 prefetch 성격의 GET만으로 unread 상태가 바뀔 수 있다.
- 수정안: `GET`은 조회만 수행하고 `POST /comments/read`로 분리한다.
- 사이드 이펙트: 댓글 드로어 열기 시 읽음 처리 API를 1회 추가 호출해야 한다.

### P2. DB CHECK와 인덱스 보강 필요

보강 후보:

1. `daily_reports`: `night_has=true`이면 `night_reason` 필수 CHECK
2. `communication_attachments`: 파일/URL XOR CHECK
3. `communication_attachments(communication_id)` index
4. `tasks.planned_start`, `communications.occurred_at`: `HH:MM` CHECK 또는 `time` 타입
5. `task_comments.parent_id`: 같은 task 소속과 1단계 깊이 강제
6. `task_comments.mentions`: 배열 대신 join table
7. `projects`: `name`, `cust_name`, `owner_user_id` 필수 정책 DB 제약화
8. `users.login_id`, `groups.name`: lower-case unique index
9. `schema_migrations`: checksum 저장

## 5. 성능 저하 가능성

### P1. `/reports` 목록 전량 조회 후 JS 처리

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/reports/page.tsx:100`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/reports/page.tsx:152`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/list.ts:139`
- 현상: 기간 전체 row를 가져온 뒤 JS에서 filter, sort, slice를 수행한다.
- 영향: 사용자·보고서·업무가 늘면 TTFB와 Node heap이 증가한다.
- 수정안: 탭, 검색, 정렬, 페이지네이션을 SQL로 이동한다.
- 성능 기준: `/reports` p95 TTFB 800ms 이하, DB 반환 row 수는 화면 page size의 3배 이하.

### P1. 업무 검색 전체 `tasks` ILIKE scan

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/list.ts:31`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/list.ts:35`
- 현상: `title`, `description`, `project`에 `%ILIKE%`를 전체 `tasks` 대상으로 수행한다.
- 확인: 로컬 `EXPLAIN`에서 Seq Scan 확인.
- 영향: 데이터가 늘면 검색어가 적어도 전체 업무 테이블을 읽는다.
- 수정안:
  1. 기간·그룹·사용자 스코프를 먼저 SQL에 적용
  2. `pg_trgm` GIN 또는 `tsvector` index 추가
  3. 한글 검색 품질 테스트 추가

### P1. 이월·재정렬 순차 SQL

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:431`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:560`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:658`
- 현상: 이월과 재정렬이 행 수만큼 순차 SQL을 실행한다.
- 영향: 업무 100개 이상에서 transaction duration과 lock 보유 시간이 선형 증가한다.
- 수정안:
  1. `INSERT INTO ... SELECT ... WHERE NOT EXISTS`
  2. `UPDATE ... FROM unnest($1::bigint[]) WITH ORDINALITY`
- 사이드 이펙트: 중복 기준이 title인지 carried_from_task_id인지 정책을 고정해야 한다.

### P2. 댓글 드로어 렌더 O(n²)

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/CommentDrawer.tsx:147`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/CommentDrawer.tsx:183`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/CommentDrawer.tsx:429`
- 현상: 활성 사용자 전체를 가져오고, 댓글 렌더에서 부모마다 자식을 다시 filter한다.
- 영향: 활성 사용자 수천 명 또는 댓글 수백 개에서 입력 지연과 render long task가 발생할 수 있다.
- 수정안:
  1. 멘션은 `?q=&limit=20` 서버 검색으로 변경
  2. 댓글은 `Map<parentId, children>`을 한 번 만든다.

### P2. 검수 상세가 전체 큐를 다시 읽음

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/review/[id]/page.tsx:34`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/review.ts:189`
- 현상: 상세 하나를 보기 위해 검수 큐 전체를 읽고 JS `findIndex`로 이전/다음을 계산한다.
- 영향: 검수대기 보고서가 수천 건이면 TTFB가 큐 크기에 비례한다.
- 수정안: 현재 id 기준 이전/다음 1건 또는 `row_number()` window query 사용.

## 6. YAGNI와 과한 표면적

### 신규 v1 생성 플래그 유지

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/domain/config.ts:13`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/reports.ts:94`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/env.ts:29`
- 현상: 운영 기본은 v2인데 `FEATURE_BUCKET_MODE=off`로 신규 v1 생성이 가능하다.
- 비용: 레거시 생성 경로가 계속 살아 있어 이중 모델 유지비가 발생한다.
- 수정안: 기존 v1 읽기 보존만 남기고 신규 v1 생성 플래그를 제거한다.

### 보고서 생성 로직 중복

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/reports.ts:103`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/scripts/dispatch.ts:136`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/scripts/dispatch.ts:207`
- 현상: `daily_reports` 생성, `model_version`, `win_*`, v1 section 생성 로직이 웹과 배치에 중복된다.
- 비용: 스키마 변경 시 웹/배치 중 한쪽만 깨질 수 있다.
- 수정안: `PoolClient`를 받는 공유 생성 함수로 합친다.

### 첨부 구현 중복

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/attachments.ts:49`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/attachments.ts:126`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/ReportEditor.tsx:447`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/ReportEditor.tsx:786`
- 현상: task/communication 첨부 저장·업로드·UI 패턴이 유사하지만 별도 구현이다.
- 비용: URL 검증, 삭제 권한, locked 정책이 한쪽만 바뀔 수 있다.
- 수정안: target별 설정을 받는 작은 helper로 정책을 공유한다.

### 예약 스키마와 화면 표면

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/db/migrations/0001_init.sql:178`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/docs/PARITY.md:18`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/review/ReviewDetail.tsx:456`
- 현상: AI 분석 예약 테이블과 미개발 패널이 남아 있다.
- 비용: 운영 화면 신뢰도와 유지보수 표면이 늘어난다.
- 수정안: 실제 구현 전까지 운영 UI에서는 숨긴다.

## 7. UX·워크플로 정합성

### 검수대기 휴가 보고서 액션 불일치

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/ReportEditor.tsx:111`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/ReportEditor.tsx:558`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:265`
- 현상: `검수대기+휴가`에서도 휴가 제출 액션이 노출되지만 서버는 `VACATION_NOT_ALLOWED`로 거부할 수 있다.
- 수정안: `검수대기+휴가`에서는 제출 버튼을 숨기거나 `사유 저장`으로 바꾼다.

### 제출 모달 문구 불일치

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/components/report/ReportEditor.tsx:999`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/report-mutations.ts:27`
- 현상: 모달은 “읽기 전용으로 잠깁니다”라고 하지만 서버는 `검수대기` 편집을 허용한다.
- 수정안: 실제 정책에 맞춰 문구 또는 서버 잠금 정책을 변경한다.

### 관리자 검수 큐 라벨

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/review/page.tsx:14`
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/lib/data/review.ts:184`
- 현상: 관리자에게 “전체”라고 표시하지만 실제 큐는 액션 가능한 큐 중심이다.
- 수정안: 라벨을 “내 검수 대상”으로 바꾸고 전체 열람은 `/reports`로 안내한다.

### React key 중복 가능성

- 근거 파일:
  - `/Users/whatsupjuno/WTF/dailyReport_seeding/src/app/(app)/reports/page.tsx:216`
- 현상: 기간 조회에서 같은 직원의 여러 날짜 보고서가 나올 수 있는데 key가 `user_id`뿐이다.
- 수정안: `report_id` 또는 `${user_id}-${report_date}` 사용.

## 8. 테스트 보강 필요 항목

현재 테스트는 전체 smoke/주요 workflow에 강하지만, data/route 통합 테스트가 부족하다.

우선 추가할 테스트:

1. `authorizeReview()` self fallback role 제한
2. `POST /api/tasks/:id/comments` 관리자 작성 403
3. `advanceReport()` expectedStatus 충돌
4. `advanceReport()` 휴가 사유 필수와 `검수대기` 편집 정책
5. 자동/수동 이월 기준 통일
6. `autoSubmitReport()`와 dispatch cron 경로
7. `notifications` dedup, retry, failed 처리
8. 첨부 다운로드 owner/reviewer/admin/unrelated 권한
9. `/reports` 검색 escape, group scope, pagination/sort
10. comments GET read side effect 제거 후 read API 테스트

테스트 구조 개선:

- E2E 파일 간 상태 공유 금지
- 각 test가 필요한 사용자·보고서·업무 fixture를 직접 생성
- 시간 의존 코드는 `TEST_NOW` 또는 주입 가능한 clock 사용
- route/data 실패 경로는 Playwright 대신 integration test로 이동

## 9. 향후 개발 시 고려사항

### 보안 체크리스트

1. 상태 변경 API는 CSRF/Origin 검증 필수
2. GET route는 DB 쓰기 금지
3. 알림 수신자는 리소스 열람권을 최종 검증
4. 보안 헤더 CSP, frame-ancestors, X-Content-Type-Options, Referrer-Policy 추가

### DB·정합성 체크리스트

1. 앱 필수값은 DB CHECK/UNIQUE/FK로 1차 고정
2. `SELECT 후 INSERT`는 `ON CONFLICT ... RETURNING id`로 통일
3. 배열 FK 대신 join table 사용
4. 알림·cron·자동제출은 먼저 멱등키 UNIQUE 설계
5. migration은 checksum으로 drift 감지
6. 삭제 정책은 업무 데이터와 감사 로그를 분리

### 성능 체크리스트

1. `/reports` p95 TTFB 800ms 이하
2. `/review/:id` p95 TTFB 700ms 이하
3. 단일 SQL p95 200ms 이하
4. 목록 요청에서 `tasks` 전체 seq scan 발생 시 실패
5. 댓글 드로어 long task 50ms 초과 0개
6. API별 query count와 DB pool wait time 기록

### 제품·UX 체크리스트

1. 상태×역할×휴가 여부별 버튼과 API 허용 결과를 1:1로 맞춘다.
2. 미개발 기능은 운영 화면에서 클릭 가능한 컨트롤로 노출하지 않는다.
3. 400/403/409 메시지는 사용자의 다음 행동을 명시한다.
4. 목록 KPI 문구는 현재 날짜/기간 필터를 반영한다.
5. 모달·드로어는 ESC, 초기 포커스, 포커스 복귀를 지원한다.

## 10. 우선순위 실행안

### 이번 턴 제외: P0 운영 안전선

P0 운영 안전선은 Claude Code 쪽 작업과 충돌하지 않도록 이번 턴의 실행안에서 제외한다. 진행 전 비교할 항목은 TLS/쿠키 정책, systemd 실행 사용자, 업로드 디렉터리, 배포 백업 절차다.

### 1단계: 권한·정합성

1. self-review fallback role 제한
2. employee가 leader 실체가 될 수 있는지 정책 확정
3. 제출 후 수정 정책 확정
4. revision 원장 또는 `검수대기` 편집 차단
5. 자동/수동 이월 기준 통일

### 2단계: 알림 신뢰성

1. production mail env strict validation
2. NCP timeout
3. notifications dedup key
4. queued/outbox 전환
5. retry/backoff와 실패 알림

### 3단계: 성능·YAGNI

1. `/reports` SQL pagination
2. 업무 검색 스코프·인덱스
3. 이월·재정렬 bulk SQL
4. 신규 v1 생성 플래그 제거
5. 첨부 helper와 보고서 생성 helper 정리

### 4단계: 테스트

1. report-mutations integration test
2. dispatch integration test
3. attachments API test
4. auth/RBAC negative test
5. list query test

## 11. 최종 결론

현재 시스템은 테스트 운영에서 핵심 workflow를 검증할 수 있는 수준까지 올라와 있다. 그러나 운영 확대 기준으로는 권한·알림·제출 후 정합성·목록 성능에 명확한 보완이 필요하다.

OTP/고정 코드 인증 방식, 미개발 문맥 검색, P0 운영 안전선은 이번 턴의 결함 실행 항목에서 제외했다. 제외 항목을 뺀 뒤에도 self-review fallback, 제출 후 수정 증적, 알림 멱등성, 목록 성능은 별도로 처리해야 한다.
