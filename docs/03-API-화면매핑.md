# 03 · API 설계 & 화면-액션-엔드포인트 매핑

> 제품: **Seeding (What The Hell Are You Doing?)** — 팀원의 일일 업무 보고를 받고 검수하는 사내 웹 시스템
> 스택: Next.js(App Router) Route Handlers(`/app/api/**/route.ts`) + Node.js + PostgreSQL · cafe24 linux 호스팅 · 메일 NCP Outbound Mailer · 타임존 **KST(Asia/Seoul)** · 영업일=평일
> 근거: `_design_decoded.html`의 `state`, `SM`, `buildSections`, `taskRow`, `stepperNodes`, `mgrRows/empRows`, `adminUsers/adminGroups`, `reviewTasksArr/reviewComm/aiMetrics`, 그리고 onClick 핸들러(`onLoginSubmit`, `onCloseTask`, `onForceClose`, `onToggleLocked`, `onApprove`, `onSubmitReject`, `onPickRecent` 등)
> 데이터: `02-데이터모델.md`의 테이블/컬럼/enum을 **그대로** 참조한다.

본 문서의 모든 엔드포인트는 데이터 모델 문서의 실테이블(`daily_reports`, `report_sections`, `tasks`, `task_attachments`, `task_links`, `communications`, `communication_attachments`, `daily_comments`, `vacations`, `reviews`, `reject_targets`, `review_events`, `report_links`, `notifications`, `users`, `groups`, `auth_otps`, `sessions`, `qualitative_metrics`)을 건드린다. 디자인에 없는 합리적 보강은 `[보강]`, 불명확 지점은 `[확인필요]`로 표기했다.

용어 정렬(01·02·04 문서와 일치):
- **report_status**(보고서 축): `not_written`(미작성)/`writing`(작성중)/`submitted`(제출완료)/`pending_review`(검수대기)/`rejected`(반려)/`resubmitted`(재제출)/`approved`(승인)/`vacation`(휴가).
- **review_status**(검수 축, 화면 표시 파생값): 검수대기/승인/반려/재제출/검수면제. 디자인 `mgrRows`/`empRows`의 테이블 헤더가 "상태"(report_status)와 "검수"(review_status) **2컬럼으로 분리**되어 있으므로, 본 문서의 목록·큐 응답도 `status`(report_status)와 `review_status`를 **별도 필드**로 내려준다(데이터모델 §2.3 정합). `[확인필요: 02 §2.3가 두 축을 한 enum에 합칠지 분리할지 확정 — 본 문서는 분리 전제]`
- **section_status**: `planned`(계획)/`writing`(작성중)/`closed`(마감완료)/`rework`(재작성)/`not_written`(미작성)/`exempt`(면제). **is_locked**: 잠금/편집 boolean.
- **task_status**: `planned`(계획)/`in_progress`(진행중)/`done`(완결)/`hold`(지연) + 파생 `due_soon`(지연임박, 계산값). `mgrRows.delay`/`empRows.delay`의 표시값 '정상/지연임박/지연'은 보고서 단위 지연 요약(파생값).

---

## 0) 공통 규약

### 0.1 경로/버전
- 모든 API는 `/api/v1/**` 하위에 둔다. App Router Route Handler 파일은 `app/api/v1/<segment>/route.ts`. `[보강]`
- 리소스는 보고서 중심 중첩: `/api/v1/reports/:reportId/sections/:sectionId/tasks/:taskId/...`.
- 날짜는 항상 `YYYY-MM-DD`(KST 영업일). 시각은 ISO8601 `timestamptz`(UTC 직렬화) + 응답에 `*_kst` 표시 문자열 동봉 가능. `[보강]`

### 0.2 인증/세션
- **OTP 로그인**: `login_id` + 이메일 수신 4자리 OTP. `auth_otps`에 해시 발급 → 검증 성공 시 `sessions` 1행 생성, 세션 토큰을 **HttpOnly·Secure·SameSite=Lax 쿠키**(`sd_session`)로 내려준다. `[보강]`
- 모든 보호 엔드포인트는 `sd_session` 쿠키의 `token_hash`로 `sessions`를 조회(미만료·`revoked_at IS NULL`)하고, `users`를 join해 `currentUser{id, role, group_id, status}`를 만든다. `users.status='inactive'`/`deleted_at` 이면 401.
- 권한 가드(미들웨어 + 핸들러 레벨 이중 검사):
  - `requireAuth()` — 세션 필수.
  - `requireRole('admin')` — 관리자 전용(사용자/그룹 관리).
  - `requireSelfReport(reportId)` — 보고서 작성/수정 계열: `daily_reports.owner_id === currentUser.id`.
  - `requireReviewer(reportId)` — 검수 계열: **별도 권한 테이블 없이** `daily_reports.group_id`의 현재 `groups.leader_id === currentUser.id`(데이터 모델 §5.4). 그룹장 변경 시 권한 자동 이동.
  - `requireInternal()` — 알림/스케줄 내부 트리거: 세션이 아니라 **서버-투-서버 시크릿 헤더**(`X-Internal-Token`)로 인증. 외부 노출 금지.
- **링크 a(report_links.token)** 접근: 이메일 링크로 들어온 비로그인 사용자는 `/r/:token`(페이지) → 토큰 검증 후 해당 보고서 owner로 OTP 로그인 유도. 토큰 자체는 인증이 아니라 "당일 보고서로 바로 이동" 라우팅 키. `[보강]`

### 0.3 표준 응답 봉투
```jsonc
// 성공
{ "ok": true, "data": { /* 리소스 */ }, "meta": { /* 선택: 페이지네이션 등 */ } }
// 실패
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "반려 사유를 입력해 주세요.", "fields": { "comment": "required" } } }
```

### 0.4 에러 코드 규약 (HTTP status · code)
| HTTP | code | 발생 예 |
|---|---|---|
| 400 | `VALIDATION_ERROR` | 업무명 누락, `planned_duration_min`이 30분 배수 아님, **반려 사유 누락**(`onSubmitReject`의 빈 코멘트 차단), 야간 '있음'인데 `night_reason` 누락 |
| 401 | `UNAUTHENTICATED` | 세션 없음/만료, 비활성 계정 |
| 401 | `OTP_INVALID` | 인증번호 불일치(디자인: "인증번호가 일치하지 않습니다") |
| 401 | `OTP_EXPIRED` | OTP 만료 |
| 404 | `USER_NOT_FOUND` | 존재하지 않는 아이디(디자인: `unknown.user` → "존재하지 않는 아이디입니다") |
| 403 | `FORBIDDEN` | 역할/소유/검수권한 불일치 |
| 404 | `NOT_FOUND` | 보고서/업무/그룹 없음 |
| 409 | `CONFLICT` | (owner, date) 보고서 중복 생성, 잠긴 시간대 수정 시도, 이미 검수 완료 |
| 409 | `SECTION_LOCKED` | `report_sections.is_locked=true` 인데 업무 추가/수정 |
| 409 | `NOT_REWORK_TARGET` | rejected 모드에서 지목되지 않은 시간대 수정 시도(`reject_targets` 미포함) |
| 422 | `STATE_INVALID` | 제출 불가 상태에서 제출(예: 이미 `approved`) |
| 429 | `RATE_LIMITED` | OTP 과다 시도(`auth_otps.attempt_count` 초과) |
| 500 | `INTERNAL` | 서버 오류 |

### 0.5 페이지네이션·필터·정렬 쿼리 규약
- 목록 공통: `?page=1&size=20` (size 기본 20, 최대 100). 응답 `meta = { page, size, total, totalPages }`. `[보강]`
- 정렬: `?sort=field:asc|desc` (다중 `sort=a:desc,b:asc`).
- 검색: `?q=` (디자인 `searchPlaceholder` "이름·업무 내용으로 검색"/"업무 내용으로 검색").
- 날짜: `?date=YYYY-MM-DD` 또는 범위 `?from=&to=`.
- **스코프 규칙**: 그룹장은 자기 그룹으로 자동 스코프된다. **admin은 스코프 강제 없이 전체**를 보며, 선택적으로 `group_id=`로 필터링한다(admin은 `group_id` NULL일 수 있어 "자기 그룹" 개념이 없음, 데이터모델 §3.2). 01-기능명세 §1.1·본 문서 §1.9와 일치.
- 보고서 목록 상태 필터(디자인 `listTabsArr`)는 **report_status 축**과 **review_status 축**을 분리해 매핑한다:
  - 관리자 뷰(mgr): `?status=all|none|delay|pending|rejected|approved` (전체/미제출/지연/검수대기/반려/승인)
  - 직원 뷰(emp): `?status=all|draft|submitted|rejected|approved` (전체/작성중/제출완료/반려/승인)
  - 매핑: `none→report_status='not_written'`, `draft→report_status='writing'`, `submitted→report_status IN ('submitted','pending_review')`, `pending→review_status='검수대기'(report_status IN 'pending_review','resubmitted')`, `delay→tasks.status='hold' 또는 지연임박 계산`, `rejected→review_status='반려'(report_status='rejected')`, `approved→review_status='승인'(report_status='approved')`.
  - 즉 `submitted`/`writing`/`not_written`/`vacation`은 **report_status**로, `검수대기`/`승인`/`반려`/`재제출`은 **review_status**로 판정한다(디자인 `mgrRows`의 "상태"/"검수" 2컬럼 구조). `[확인필요: 02 §2.3 enum 분리 확정 의존]`

---

## 1) 엔드포인트 목록

표기: **METHOD PATH** · 권한 · 목적 · 핵심 요청필드 · 응답 스케치 · 건드리는 테이블.

### 1.1 인증 / 세션

#### `POST /api/v1/auth/otp/request`
- **권한**: 공개(비로그인)
- **목적**: 로그인용 4자리 OTP 발급·메일 발송(NCP). 디자인의 로그인 진입(메일 링크 배너 또는 직접 진입).
- **요청**: `{ "login_id": "kim.doyun", "report_date": "2026-06-19" /*선택, 링크 동봉 시*/ }`
- **응답**: `{ "ok": true, "data": { "sent": true, "masked_email": "kim***@corp.com", "expires_in_sec": 300 } }`
  - `login_id` 없음 → `404 USER_NOT_FOUND` (디자인 `unknown.user`).
  - **OTP 만료**: `auth_otps.expires_at`은 발급 후 5분(`expires_in_sec: 300`). 04-백엔드 §2.5와 동일 값으로 통일. 단 안내 메일에 OTP를 동봉(하루 단위 링크 a와 함께)하는 경우, 메일 수신 후 작성 시점까지 유효해야 하므로 5분이 과도하게 짧을 수 있다는 트레이드오프가 있다 → 재발송 흐름 또는 만료값 상향 여부 `[확인필요]`.
- **테이블**: `users`(조회), `auth_otps`(insert: `code_hash`, `expires_at`, `report_date`), `notifications`(`kind='login_otp'` 발송 로그).

#### `POST /api/v1/auth/login`
- **권한**: 공개
- **목적**: `onLoginSubmit` — 아이디+OTP 4자리 검증, 세션 발급.
- **요청**: `{ "login_id": "kim.doyun", "otp": "7391" }`
- **응답**: `{ "ok": true, "data": { "user": { "id": 2, "name":"김도윤", "role":"group_leader", "group_id": 1 }, "redirect": "/reports/today" } }` + `Set-Cookie: sd_session=...`
  - 아이디 없음 → `404 USER_NOT_FOUND`("존재하지 않는 아이디입니다").
  - OTP 불일치 → `401 OTP_INVALID`("인증번호가 일치하지 않습니다"), `auth_otps.attempt_count++`.
  - 만료 → `401 OTP_EXPIRED`. 시도 초과 → `429 RATE_LIMITED`.
  - **OTP 4자리 미완성은 클라이언트에서 차단**(`ready = idDone && otpDone`, 버튼 비활성)하여 서버 호출이 발생하지 않는다. 서버 도달 시점에는 항상 4자리.
  - 성공 시 `auth_otps.consumed_at=now()`. 로그인 직후 **당일 보고서로 이동**(`report_date` 또는 오늘 KST 영업일의 `daily_reports` upsert 후 redirect).
- **테이블**: `auth_otps`(검증·consume·attempt), `sessions`(insert), `users`(조회), (당일 보고서 보장 위해) `daily_reports`.

#### `POST /api/v1/auth/logout`
- **권한**: 로그인
- **목적**: `onLogout`.
- **응답**: `{ "ok": true }` + 세션 쿠키 만료.
- **테이블**: `sessions`(`revoked_at=now()`).

#### `GET /api/v1/auth/me`
- **권한**: 로그인
- **목적**: 셸 상단 프로필(`onProfile` 모달 소스), 화면 가드 부트스트랩.
- **응답**: `{ "ok": true, "data": { "id":2, "login_id":"kim.doyun", "name":"김도윤", "email":"...", "role":"group_leader", "group_id":1, "group_name":"개발팀", "department":"개발팀", "position_title":"팀장", "avatar_url":null } }`
- **테이블**: `sessions`, `users`, `groups`(이름 join).

### 1.2 보고서 (조회/생성/시간대 마감/제출)

#### `GET /api/v1/reports/today`
- **권한**: 로그인(본인)
- **목적**: 로그인 후 당일 보고서로 바로 이동. 없으면 생성(upsert)하여 `morningPlan` 진입 상태 반환.
- **동작**: 오늘 KST 영업일로 `daily_reports`를 `(owner_id, report_date)` upsert. 최초 생성 시 `report_sections`에 `plan`(필요 시) seed, `report_links` 토큰 발급(없으면).
- **응답**: 아래 `GET /reports/:id`와 동일 형태 + `{ "report_id": 123 }`.
- **테이블**: `daily_reports`, `report_sections`, `report_links`.

#### `GET /api/v1/reports/:reportId`
- **권한**: 로그인 — 본인(owner) 또는 검수자(그룹장) 또는 admin
- **목적**: 작성 화면(`buildSections`/`stepperNodes`)과 검수 화면(`reviewTasksArr`)의 **단일 소스**. `write_mode`/`status`/섹션/업무/커뮤/코멘트/휴가/검수이력 전체를 한 번에.
- **참고(섹션 표시명·블록 구성)**: 섹션 `name`은 `write_mode`에 종속한다(디자인 `buildSections`). 예: `morningClose`에선 오전이 `오전 계획`(locked)+`오전 마감`(editable) **2블록**으로, `afternoonClose`부터는 `오전 (계획·마감)` **1블록**으로 병합 렌더된다. 데이터 모델은 `UNIQUE(report_id, kind)`로 kind당 1행이므로, "오전 계획/오전 마감"은 **같은 `morning` section의 2단계 뷰**(API는 단일 section 행을 두 블록으로 표현)로 본다. `[확인필요: 같은 morning section 2단계 뷰 vs 별도 2행 — 02 §3.6과 정합 확정 필요]`
- **응답 스케치**:
```jsonc
{ "ok": true, "data": {
  "id": 123, "report_date": "2026-06-19", "status": "writing",
  "write_mode": "afternoonClose",
  "owner": { "id": 5, "name": "김도윤", "department": "개발팀", "position_title": "팀장" },
  "group_id": 1,
  "night": { "branch": null, "reason": null, "expected_end_at": null },  // branch: 'yes'|'no'|null (API) ↔ night_branch boolean (DB)
  "comm_none": false,
  "stepper": [ { "kind":"plan", "label":"계획", "time":"08:30", "section_status":"closed", "current": false },
               { "kind":"morning", "label":"오전", "time":"11:50", "section_status":"closed", "current": false },
               { "kind":"afternoon", "label":"오후", "time":"17:50", "section_status":"writing", "current": true },
               { "kind":"night", "label":"야간", "time":null, "section_status":"not_written", "current": false } ],
  "sections": [
    { "id": 11, "kind":"morning", "name":"오전 (계획·마감)", "range":"08:30 ~ 11:50",
      "status":"closed", "is_locked": true, "summary":"완결 2 · 지연 1",
      "tasks": [
        { "id": 101, "title":"결제 모듈 환불 API 연동", "project":"결제 시스템",
          "status":"done", "planned_start":"09:00", "planned_duration_min":120, "actual_duration_min":150,
          "hold_reason": null, "sort_order": 0, "closed_at":"...",
          "attachments": [ { "id":1, "kind":"file", "file_name":"x.pdf", "file_url":"...", "comment":"" } ],
          "links": [ { "prev_task_id": 88, "carryover_source_task_id": null, "link_type":"continue" } ] }
      ] },
    { "id": 12, "kind":"afternoon", "name":"오후 마감", "range":"11:50 ~ 17:50",
      "status":"writing", "is_locked": false, "tasks":[ /* editable */ ] }
  ],
  "communications": [ { "id":1, "type":"meeting", "counterpart":"이서연", "occurred_at":"...", "summary":"...", "attachments":[...] } ],
  "daily_comment": { "body": "..." },
  "vacation": null,
  "review": {
    "report_status": "writing",
    "review_status": null,                    // 검수 축(검수대기/승인/반려/재제출). 미제출이면 null
    "queue_position": null,
    "meta_text": "최초제출 11:48 · 반려 13:05 · 재제출 17:54",
    "reject_targets": [ { "scope":"afternoon", "section_id": 12 } ],
    "timeline": [ { "event_type":"submitted", "occurred_at":"...", "actor":"김도윤", "note":null },
                  { "event_type":"rejected", "occurred_at":"...", "actor":"김지원", "note":"오후 업무 계획 누락…" } ]
  }
} }
```
- **테이블(읽기)**: `daily_reports`, `report_sections`, `tasks`, `task_attachments`, `task_links`, `communications`, `communication_attachments`, `daily_comments`, `vacations`, `reviews`, `reject_targets`, `review_events`, `users`/`groups`.

#### `PATCH /api/v1/reports/:reportId`
- **권한**: 본인(owner)
- **목적**: 보고서 헤더 레벨 누적 저장("저장됨 · 오후 5:52"). `write_mode` 전환, `comm_none`, 야간 분기 입력.
- **요청**(부분): `{ "write_mode":"nightClose", "comm_none": true, "night": { "branch":"yes", "reason":"PG 점검 대응", "expected_end_at":"2026-06-19T12:30:00Z" } }`
  - **야간 분기 매핑 규칙**: API 페이로드의 `night.branch`는 `'yes' | 'no' | null` 문자열이고, 서버가 이를 `daily_reports.night_branch boolean`(`'yes'→true` / `'no'→false` / `null→NULL`)으로 변환해 저장한다. 디자인 핸들러(`onNightYes/onNightNo`)는 `'yes'/'no'`를 쓰지만 **저장은 boolean**이다(01-기능명세 §2.2/§4.5와 정합).
  - 야간 `branch:"yes"`(→`night_branch=true`) & `reason` 없음 → `400 VALIDATION_ERROR`(CHECK `ck_report_night_reason`).
- **응답**: `{ "ok": true, "data": { "updated_at":"...", "status":"writing" } }`
- **테이블**: `daily_reports`(`write_mode`/`night_branch`/`night_reason`/`night_expected_end_at`/`comm_none`/`updated_at`).

#### `POST /api/v1/reports/:reportId/sections`
- **권한**: 본인
- **목적**: 시간대 블록 보장(필요 시 생성). 예: 오전 계획 진입 시 `plan`/`morning`, 오후 진입 시 `afternoon`, 야간 '있음'(`branch='yes'`) 시 `night`.
- **요청**: `{ "kind": "afternoon" }`
- **응답**: `{ "ok": true, "data": { "id": 12, "kind":"afternoon", "status":"writing", "is_locked": false } }` (이미 있으면 그대로 반환, `UNIQUE(report_id, kind)`)
- **참고**: 야간 '없음'(`branch='no'`)이면 `night` section 행을 **생성하지 않는다**. `exempt`(면제) 상태는 휴가 등 별도 사유로 행이 존재할 때만 사용한다(데이터모델 §5.5, 01-기능명세 §2.4와 동일 규칙).
- **테이블**: `report_sections`(upsert).

#### `POST /api/v1/reports/:reportId/sections/:sectionId/close`
- **권한**: 본인
- **목적**: **시간대 마감**(오전 마감/오후 마감). 디자인 `writePrimary`의 "오전 마감하기"/잠금 전환. 해당 섹션을 `is_locked=true`, `section_status='closed'`, `closed_at=now()`, `summary` 갱신.
- **요청**: `{ "force": false }` (개별 마감만으로 모두 완결이면 force 불필요)
- **동작**: 미완(`status<>'done'`) 업무가 남아 있고 `force=false` → `409 STATE_INVALID`(미완 업무 안내). `force=true`면 **강제 마감**(아래 `force-close`와 동일 트랜잭션 로직 재사용).
- **`close`(force 옵션) vs `force-close` 책임 정리** `[확인필요]`: 두 엔드포인트는 "미완 업무 일괄 완결 + 섹션 잠금"을 모두 수행할 수 있어 책임이 중복된다. 디자인 `onForceClose`는 **업무 일괄 완결만** 수행하고 섹션 잠금(`is_locked`)은 별도 "마감하기"(`onClose…`) 액션이다(디자인 코드 기준 잠금 전이가 `onForceClose`에 없음). 본 문서는 운영 편의상 강제마감을 마감 트랜잭션에 포함시켰으나, **섹션 잠금을 어느 액션에 둘지**(완결만 vs 완결+잠금)는 구현 시 한쪽으로 확정해야 한다. `[보강: 디자인 onForceClose=일괄 완결, 잠금은 close 액션. 본 문서는 force-close에 잠금 포함]`
- **응답**: `{ "ok": true, "data": { "section": { "id":11, "is_locked": true, "status":"closed", "summary":"완결 2 · 지연 1" } } }`
- **테이블**: `report_sections`(잠금/요약), `tasks`(force 시 일괄 done), `daily_reports`(`updated_at`).

#### `POST /api/v1/reports/:reportId/submit`
- **권한**: 본인
- **목적**: **제출**(`writePrimary` "최종 제출"/"계획 제출"/"야간 계획 저장"/"재제출하기"/"휴가로 제출"). `write_mode`에 따라 분기.
- **요청**: `{ "mode": "afternoonClose" }` (서버는 현재 `write_mode`·상태로 재검증)
- **동작**:
  - 일반 최종 제출(afternoonClose, 또는 야간 '없음' nightClose): `status: writing → submitted → pending_review`(즉시 검수 큐 진입), `report_sections` 편집 섹션 잠금, `first_submitted_at`(최초) / `last_submitted_at` 기록, `review_events(event_type='submitted')` insert.
  - **야간 '있음'(`branch='yes'`) 2단계 제출**(01-기능명세 §2.1·§2.2와 동일): ① 1차 `야간 계획 저장`(`write_mode='nightClose'`, **상태 `writing` 유지**, `night_expected_end_at` 확정, `night` section 생성·계획 작성) → ② 야간 종료 후 2차 `최종 제출`(`status → submitted → pending_review`). 즉 야간있음의 최종 제출도 본 엔드포인트(`mode='nightClose'`, 2차 호출)로 일어난다.
  - 재제출(rejected 모드): 지목 섹션이 모두 작성됐는지 확인 → `status='resubmitted'`(→`pending_review`), `review_events('resubmitted')`, 지목 섹션 `is_locked=true`.
  - 야간 '없음'(`branch='no'`): `night_branch=false`, 야간 section 생성 안 함(§sections 참고).
  - 검증 실패: 필수 미충족 → `400 VALIDATION_ERROR`; 잘못된 상태 → `422 STATE_INVALID`.
- **응답**: `{ "ok": true, "data": { "status":"pending_review", "last_submitted_at":"...", "queue":{ "group_id":1 } } }`
- **테이블**: `daily_reports`(상태/제출시각), `report_sections`(잠금), `review_events`(insert).

### 1.3 업무 (CRUD · 개별마감 · 강제마감 · 이월/연속성 · 최근업무 자동완성)

#### `POST /api/v1/reports/:reportId/sections/:sectionId/tasks`
- **권한**: 본인 · 섹션 editable
- **목적**: 업무 추가(`onToggleAdd` 폼 저장). `onPickProject`/`onPickRecent`로 채운 값 포함.
- **요청**:
```jsonc
{ "title":"환불 정책 변경분 QA 시나리오 작성", "project":"결제 시스템",
  "planned_start":"14:00", "planned_duration_min":120, "status":"planned",
  "sort_order": 3,
  "link": { "type":"carryover", "prev_task_id": null, "carryover_source_task_id": 88 } /*선택*/ }
```
  - `title` 필수 → 없으면 `400 VALIDATION_ERROR`.
  - 섹션 `is_locked=true` → `409 SECTION_LOCKED`.
  - rejected 모드: 섹션이 `reject_targets`에 없으면 `409 NOT_REWORK_TARGET`.
  - `[보강]` 디자인 추가 폼의 "추가" 버튼은 데모에서 `onCancelAdd`(닫기만)에 바인딩되어 실제 저장이 없으나, 실서비스는 이 엔드포인트로 `POST tasks`를 수행한다.
- **응답**: `{ "ok": true, "data": { "id": 105, ...task } }`
- **테이블**: `tasks`(insert; `report_id` 비정규화 포함), `task_links`(link 동봉 시).

#### `PATCH /api/v1/reports/:reportId/tasks/:taskId`
- **권한**: 본인 · 섹션 editable
- **목적**: 업무 수정(상태 변경 진행중/지연, 실제 소요시간, 지연 사유, 정렬 등).
- **요청**: `{ "status":"hold", "hold_reason":"로그 수집 권한 대기", "actual_duration_min": 150, "planned_start":"09:30", "sort_order": 1 }`
  - `status='hold'` & `hold_reason` 없음 → `400`(CHECK `ck_tasks_hold`).
  - `planned_duration_min % 30 != 0` 또는 `planned_start` 분이 0/30 아님 → `400`.
- **응답**: `{ "ok": true, "data": { ...task } }`
- **테이블**: `tasks`.

#### `DELETE /api/v1/reports/:reportId/tasks/:taskId`
- **권한**: 본인 · 섹션 editable
- **목적**: 업무 삭제(추가 폼에서 잘못 넣은 행 제거).
- **응답**: `{ "ok": true }`
- **테이블**: `tasks`(CASCADE로 `task_attachments`/`task_links` 동반 삭제).

#### `POST /api/v1/reports/:reportId/tasks/:taskId/close`
- **권한**: 본인 · 섹션 editable
- **목적**: **개별 마감**(`onCloseTask`) — 업무를 완결로 전환. 디자인 `taskRow`의 `canClose`/`개별 마감 완료`.
- **요청**: `{ "actual_duration_min": 80 }` (선택)
- **동작**: `status='done'`, `closed_at=now()`. 디자인상 마감 시 `hold` 사유 표시 제거(완결이므로).
- **응답**: `{ "ok": true, "data": { "id":101, "status":"done", "closed_at":"...", "detail":"개별 마감 완료" } }`
- **테이블**: `tasks`.

#### `POST /api/v1/reports/:reportId/sections/:sectionId/force-close`
- **권한**: 본인 · 섹션 editable
- **목적**: **강제 마감**(`onForceClose`) — 한 시간대의 **미완 업무 전체를 일괄 완결**. 디자인은 `dataset.titles`를 `|`로 받아 처리.
- **요청**: `{ "task_ids": [102,103] }` (선택; 미지정 시 해당 섹션의 모든 미완 업무) `[보강: 디자인은 title 기반이나 API는 id 기반]`
- **동작**: 트랜잭션으로 대상 `tasks.status='done'`, `closed_at=now()` 일괄 → 섹션 `is_locked=true`, `section_status='closed'`, `summary` 갱신. `[확인필요: §1.2 close(force)와 책임 중복 — 잠금을 close에만 둘지 force-close에도 둘지 확정. 디자인 onForceClose는 일괄 완결만 수행]`
- **응답**: `{ "ok": true, "data": { "closed_count": 2, "section": { "id":12, "is_locked": true, "summary":"완결 3" } } }`
- **테이블**: `tasks`(일괄 update), `report_sections`.

#### `GET /api/v1/tasks/recent`
- **권한**: 본인
- **목적**: **최근 업무 자동완성**(`onPickRecent`/`RECENT`/`PROJECTS`). 프로젝트명 입력 시 최근 진행 업무 추천. 디자인 `addSuggestions` 필터링.
- **쿼리**: `?project=결제` (부분일치), `?limit=5`
- **응답**:
```jsonc
{ "ok": true, "data": {
  "projects": ["결제 시스템","정산 배치","주문 도메인"],
  "suggestions": [
    { "title":"결제 모듈 환불 API 연동", "project":"결제 시스템", "planned_duration_min":120 },
    { "title":"결제 PG 점검 대응 대기", "project":"결제 시스템", "planned_duration_min":90 }
  ] } }
```
- **테이블**: `tasks`(본인 과거 `tasks`에서 `project` ILIKE, 최근순 distinct — 데이터 모델 §5.7, 별도 마스터 없음).

#### `GET /api/v1/tasks/carryover`
- **권한**: 본인
- **목적**: **"어제 미완료 불러오기"**(연속성). 직전 영업일 보고서의 미완(`status in ('planned','in_progress','hold')`) 업무 목록. 모든 editable 섹션(`morningPlan` 포함)에서 노출되는 버튼의 데이터 소스.
- **쿼리**: `?for_date=2026-06-19`
- **응답**: `{ "ok": true, "data": { "source_date":"2026-06-18", "tasks": [ { "id":88, "title":"...", "project":"...", "status":"hold" } ] } }`
- **사용**: 응답의 `id`를 `POST tasks`의 `link.carryover_source_task_id`로 전달.
- **테이블**: `tasks`/`report_sections`/`daily_reports`(직전 영업일 조회).

### 1.4 첨부 업로드

#### `POST /api/v1/uploads`
- **권한**: 로그인
- **목적**: 파일 바이너리 업로드(업무 첨부·커뮤 첨부 공통). multipart/form-data. cafe24 스토리지/디스크 경로 반환. `[보강: 디자인은 파일 선택 버튼만 있고 업로드 API 없음 — 분리 보강]`
- **요청**: `multipart` `file=@...`
- **응답**: `{ "ok": true, "data": { "file_url":"/uploads/2026/06/abc.pdf", "file_name":"환불정책_변경안_v2.pdf", "size": 10240 } }`
- **테이블**: 없음(메타만 반환). 실제 연결은 아래 첨부 생성 API에서.

#### `POST /api/v1/tasks/:taskId/attachments`
- **권한**: 본인 · 섹션 editable
- **목적**: 업무 첨부 생성(`addFiles`/`addUrls`, 파일·URL 복수 + 코멘트). `task_attachments` 통합 테이블.
- **요청(파일)**: `{ "kind":"file", "file_url":"/uploads/...", "file_name":"x.pdf", "comment":"근거 정리본", "sort_order":0 }`
- **요청(URL)**: `{ "kind":"url", "url":"https://...", "comment":"PR 링크", "sort_order":1 }`
  - CHECK `ck_task_att_payload` 위반 시 `400`.
- **응답**: `{ "ok": true, "data": { "id": 7, "kind":"file", ... } }`
- **테이블**: `task_attachments`.

#### `DELETE /api/v1/tasks/:taskId/attachments/:attachmentId`
- **권한**: 본인 · 섹션 editable
- **목적**: 첨부 제거(`onRemoveFileRow`/`onRemoveUrlRow`).
- **응답**: `{ "ok": true }`
- **테이블**: `task_attachments`.

### 1.5 커뮤니케이션 (CRUD)

#### `GET /api/v1/reports/:reportId/communications`
- **권한**: 본인 또는 검수자
- **목적**: 커뮤 로그 목록(`commLogs`/`reviewComm`).
- **응답**: `{ "ok": true, "data": [ { "id":1, "type":"meeting", "counterpart":"이서연", "occurred_at":"...", "summary":"...", "attachments":[...], "sort_order":0 } ] }`
- **테이블**: `communications`, `communication_attachments`.

#### `POST /api/v1/reports/:reportId/communications`
- **권한**: 본인
- **목적**: 커뮤 기록 추가. `comm_none=true`("오늘 커뮤니케이션 없음")이면 추가 차단/플래그 해제.
- **요청**: `{ "type":"call", "counterpart":"박지훈 (영업팀)", "occurred_at":"2026-06-19T05:20:00Z", "summary":"공동 프로모션 일정 협의", "sort_order":0 }`
  - `summary`(`NOT NULL`) 누락 → `400`.
  - `[보강/확인필요]` **커뮤니케이션 신규 항목 입력 폼(type/상대/시각/요약)은 디자인에 수록되어 있지 않다**(디자인 커뮤 섹션은 기존 `commLogs` 목록 + "오늘 커뮤니케이션 없음" 체크 + 항목별 인라인 첨부 버튼만 존재). 입력 필드 구성은 `reviewComm`/`commLogs` 데이터 스키마에서 역산한 보강이다. `[확인필요: 신규 입력 폼 디자인 부재]`
- **응답**: `{ "ok": true, "data": { "id": 4, ... } }`
- **테이블**: `communications`, (커뮤 첨부 별도 API: `POST /communications/:id/attachments`).

#### `PATCH /api/v1/communications/:commId` · `DELETE /api/v1/communications/:commId`
- **권한**: 본인
- **목적**: 커뮤 수정/삭제.
- **테이블**: `communications`(+CASCADE `communication_attachments`).

#### `POST /api/v1/communications/:commId/attachments` · `DELETE .../attachments/:id`
- **권한**: 본인
- **목적**: 커뮤 첨부(파일+코멘트, 선택). **디자인의 항목별 인라인 "＋ 첨부파일·코멘트(선택)" 버튼**이 이 엔드포인트의 트리거다(commLog 항목 하단 인라인 추가).
- **요청**: `{ "file_url":"/uploads/...", "file_name":"환불정책_변경안_v2.pdf", "comment":"합의된 변경 범위 정리본" }`
- **테이블**: `communication_attachments`.

### 1.6 일일 코멘트

#### `PUT /api/v1/reports/:reportId/daily-comment`
- **권한**: 본인
- **목적**: 보고서당 1개 일일 코멘트(최대 500자) upsert. `UNIQUE(report_id)`. 디자인 `0 / 500` 카운터.
- **요청**: `{ "body": "오늘 결제 도메인 위주로 진행했고…" }`
  - 500자 초과 → `400`(CHECK `ck_dailycomment_len`).
- **응답**: `{ "ok": true, "data": { "body":"...", "updated_at":"..." } }`
- **테이블**: `daily_comments`(upsert).

### 1.7 휴가

#### `PUT /api/v1/reports/:reportId/vacation`
- **권한**: 본인
- **목적**: **휴가로 처리**(`onGoVacation` → `writePrimary` "휴가로 제출"). 보고서를 휴가로 전환, 휴가 1건 upsert, `daily_reports.status='vacation'` 동기화. 휴가 전환 프롬프트는 `morningClose`/`afternoonClose`에서만 노출(디자인 `showVacationPrompt`).
- **요청**: `{ "type":"annual", "comment":"인수인계: 결제 PG 모니터링은 박서준" }`
- **동작**: `vacations` upsert(`UNIQUE(report_id)`), `daily_reports.status='vacation'`, `write_mode='vacation'`. 휴가 보고서도 검수 대상(제출 처리 포함). 휴가로 처리된 시간대 section은 필요 시 `section_status='exempt'`(면제). 단 야간 '없음'으로 인한 미생성과 혼동 금지 — `exempt`는 휴가 등 사유로 **행이 존재할 때만** 사용한다.
- **응답**: `{ "ok": true, "data": { "status":"vacation", "vacation":{ "type":"annual", ... } } }`
- **테이블**: `vacations`(upsert), `daily_reports`, `report_sections`(exempt).

#### `DELETE /api/v1/reports/:reportId/vacation`
- **권한**: 본인
- **목적**: 휴가 취소(`onExitVacation` → `morningClose` 복귀).
- **동작**: `vacations` 삭제, `daily_reports.status`를 직전 작성 상태로 복원. `[확인필요: 복원 기준 상태]`
- **테이블**: `vacations`, `daily_reports`.

### 1.8 검수 (목록/상세/승인/반려)

#### `GET /api/v1/reviews/queue`
- **권한**: 검수자(그룹장)
- **목적**: 검수 큐("검수 대기 N건 중 M번째"). 자기 그룹 구성원의 보고서 중 `pending_review|resubmitted`.
- **쿼리**: `?date=2026-06-19&status=pending&page=1&size=20`
- **응답**:
```jsonc
{ "ok": true, "data": [
  { "report_id": 201, "owner":{"name":"김지원","dept":"마케팅팀"},
    "status":"submitted",            // report_status 축
    "review_status":"검수대기",       // review_status 축(분리)
    "done_ratio":{"done":9,"total":10}, "delay":"정상", "submitted_at":"11:50", "action":"검수" }
 ], "meta": { "page":1, "size":20, "total":8, "totalPages":1, "queue_total":8 } }
```
- **테이블**: `daily_reports`(group_id=내 그룹, status 필터), `tasks`(완결 비율 집계), `reviews`(최신 검수상태), `users`.

#### `GET /api/v1/reviews/:reportId`
- **권한**: 검수자(그룹장) — `requireReviewer`
- **목적**: 검수 상세(`reviewVariant`). `reviewTasksArr`/`reviewComm`/`reviewNightReason`/검수이력 타임라인/큐 위치. 우측 AI 패널은 **v1 deferred**(영역만, `qualitative_metrics` 빈 자리).
- **reviewVariant(디자인 `state.reviewVariant`)**: `pending`/`approved`/`rejected`/`resubmitted`/`vacation`/`employee`(직원 읽기)/`analyzing`(분석 중) — **총 7개**. 이 중 `analyzing`은 AI 분석 패널이 "분석 중" 상태일 때의 변형으로, **v1 미사용 변형**(AI 미개발, deferred)이다. 응답은 다음 파생 플래그를 함께 내린다:
  - `review_analyzing = (reviewVariant === 'analyzing')`
  - `review_show_ai = (reviewVariant !== 'analyzing' && reviewVariant !== 'vacation')` → **휴가/analyzing 변형에서는 AI 패널 미표시**.
  - `review_queue_pos`는 `employee` 변형에서 `null`(큐 네비 숨김).
- **헤더 배지**: 디자인 검수 헤더는 `검수대기`+`재제출`+`지연`을 **복수 병렬 배지**로 표시한다. 응답은 `status_badges` 배열(report_status 배지 + 파생 `재제출`/`지연` 배지)을 내려준다.
- **응답**: `GET /reports/:id`와 동일 본문 + 검수 메타:
```jsonc
{ "ok": true, "data": {
  "report": { /* GET /reports/:id 본문 */ },
  "review_variant": "pending",          // pending|approved|rejected|resubmitted|vacation|employee|analyzing(v1 미사용)
  "review_analyzing": false,
  "review_show_ai": true,               // vacation/analyzing이면 false
  "review_queue_pos": "검수 대기 8건 중 3번째",  // employee 변형이면 null
  "status_badges": ["검수대기","재제출","지연"],   // 복수 병렬 배지 조합
  "meta_text": "최초제출 11:48 · 반려 13:05 · 재제출 17:54",
  "night_reason": "PG사 정기 점검 대응으로 21:30까지 야간 대기가 필요합니다.",
  "timeline": [ {"event_type":"submitted","occurred_at":"11:48","actor":"김지원"},
                {"event_type":"rejected","occurred_at":"13:05","actor":"김지원","note":"오후 업무 계획 누락…"},
                {"event_type":"resubmitted","occurred_at":"17:54","actor":"김지원"} ],
  "ai_panel": { "deferred": true, "metrics": [] }   // v1 미산출(영역 예약). review_show_ai=false면 미표시
} }
```
- **테이블(읽기)**: `daily_reports`, `report_sections`, `tasks`, `task_attachments`, `communications`, `daily_comments`, `vacations`, `reviews`, `reject_targets`, `review_events`, `qualitative_metrics`(빈 자리 확인용).

#### `POST /api/v1/reviews/:reportId/approve`
- **권한**: 검수자(그룹장) — `requireReviewer`
- **목적**: **승인**(`onApprove`). 디자인: `reviewVariant='approved'`, 상태 배너 "[승인됨] …".
- **요청**: `{ "comment": "수고하셨습니다" /*선택*/, "round": 2 /*선택, 서버 산출 가능*/ }`
- **동작**: `reviews(action='approve', reviewer_id=currentUser)` insert, `daily_reports.status='approved'`, `approved_at=now()`, `review_events(event_type='approved')`. 이미 `approved` → `409 CONFLICT`.
- **참고**: 승인 시 메일 발송 여부 및 `notification_kind` enum(`approve_notice`) 추가는 미정. 04-백엔드 §7에서 `[확인필요]`로 열려 있으며, 본 문서·데이터모델은 승인 메일을 정의하지 않는다(직접 모순 아님, 범위 미확정).
- **응답**: `{ "ok": true, "data": { "status":"approved", "approved_at":"...", "review_id": 55 } }`
- **테이블**: `reviews`(insert), `daily_reports`, `review_events`.

#### `POST /api/v1/reviews/:reportId/reject`
- **권한**: 검수자(그룹장) — `requireReviewer`
- **목적**: **반려**(`onOpenReject` → 모달 → `onSubmitReject`). 반려 모달: 사유 템플릿(`onPickRejectTemplate`) + 대상 시간대 지목 + 코멘트(필수).
- **요청**:
```jsonc
{ "template": "schedule_missing",                 // enum reject_template (선택)
  "comment": "오후 업무 계획이 누락되었습니다. 14시 이후 일정을 추가해 주세요.", // 필수
  "scopes": ["afternoon"] }                        // reject_scope[] : all|morning|afternoon|night
```
  - `comment` 공백/누락 → `400 VALIDATION_ERROR`(`onSubmitReject`의 `!rejectComment.trim()` 차단 = CHECK `ck_reviews_reject_comment`).
  - `scopes` 비어 있음 → `400`(지목 1개 이상). `all` 지정 시 전체 시간대 재작성.
  - `[보강]` **디자인 반려 모달의 대상 지목은 단일 `<select>`(1개 scope)** 이고, 템플릿(`onPickRejectTemplate`)은 라벨을 **코멘트 textarea에 프리필**할 뿐 별도 컬럼 저장이 아니다. 본 문서는 `scopes[]`(복수 scope, `reject_targets` 복수 행)와 `template` 컬럼 분리 저장으로 **확장**했다(데이터모델 §2.9/§3.15와 정합). 단일 select 전제에선 `scopes`가 항상 1개이므로 "scopes 비어있음→400"은 디자인상 발생하지 않을 수 있다. `custom`(직접 입력) enum도 디자인엔 없는 보강이다.
- **동작**: 트랜잭션 — `reviews(action='reject', template, comment)` insert → 각 scope를 `reject_targets`에 insert(`UNIQUE(review_id, scope)`; 가능 시 `section_id` 매핑) → `daily_reports.status='rejected'` → 지목 섹션 `is_locked=false`, `section_status='rework'` (나머지 잠금 유지) → `review_events(event_type='rejected')`. **반려 안내 메일** 트리거(`notifications.kind='reject_notice'`).
- **응답**: `{ "ok": true, "data": { "status":"rejected", "review_id": 56, "reject_targets":[{"scope":"afternoon","section_id":12}] } }`
- **테이블**: `reviews`, `reject_targets`, `daily_reports`, `report_sections`, `review_events`, `notifications`.

#### `GET /api/v1/reviews/:reportId/timeline`
- **권한**: 검수자 또는 본인
- **목적**: 검수 이력 타임라인 단독 조회(제출→반려→재제출→승인). `[보강: 디자인엔 별도 조회 UI가 없고 검수 이력은 GET /reviews/:reportId 응답에 포함됨 — 본 엔드포인트는 선택적 보강이며 상세 응답으로 충분]`
- **응답**: `{ "ok": true, "data": [ { "event_type":"submitted", "occurred_at":"...", "actor":"...", "note":null } ] }`
- **테이블**: `review_events`(+`reviews`/`users` join).

### 1.9 목록 (대시보드)

#### `GET /api/v1/reports`
- **권한**: 로그인 — 역할별 스코프
- **목적**: 디자인 `list` 화면. 직원 뷰(`empRows`, 내 보고서 이력) / 관리자(그룹장) 뷰(`mgrRows`, 팀 현황).
- **쿼리**: `?view=employee|manager&status=...&date=...&q=...&page=1&size=20`
  - `view=manager`는 그룹장(자기 그룹) 또는 admin(스코프 강제 없이 전체, 선택적 `group_id=` 필터). 직원은 `view=employee`로 본인 이력만.
- **상태/검수 2축**: 디자인 테이블 헤더 "상태"(report_status)와 "검수"(review_status)에 맞춰 응답에 `status`와 `review_status`를 **별도 필드**로 내린다.
- **응답(manager)**:
```jsonc
{ "ok": true, "data": [
  { "owner":{"name":"김지원","dept":"마케팅팀"}, "report_id":201,
    "status":"submitted",            // report_status
    "review_status":"검수대기",       // review_status(분리)
    "done":{"done":9,"total":10}, "delay":"정상",
    "submitted_at":"11:50", "action":"검수" } ],
  "meta": { "page":1, "size":20, "total":18, "totalPages":1,
            "stats": { "submitted":"14/18", "not_written":4, "delay":3, "pending":6 } } }
```
- **응답(employee)**: `[{ "report_date":"06-17", "day":"수", "status":"submitted", "review_status":"승인", "done":{"done":9,"total":11}, "delay":"정상", "submitted_at":"17:48" }]` — 휴가일은 `status:"vacation"`, `review_status:"—"`, `done:"—"`.
- **stats**(`listStats`: 오늘 제출/미제출/지연/검수대기)는 `meta.stats`로 동봉.
- **테이블**: `daily_reports`, `tasks`(완결 비율·지연 집계), `reviews`(최신 검수상태), `users`, `groups`.

### 1.10 관리 (사용자 · 그룹 · 그룹장 변경)

#### `GET /api/v1/admin/users`
- **권한**: admin
- **목적**: 사용자 관리 목록(`adminUsers`).
- **쿼리**: `?q=&role=&group_id=&status=&page=`
- **응답**: `{ "ok": true, "data": [ { "id":1, "login_id":"kim.doyun", "name":"김도윤", "email":"...", "group_id":1, "group_name":"개발팀", "role":"group_leader", "status":"active" } ], "meta": { "total":8, ... } }`
- **테이블**: `users`, `groups`.

#### `POST /api/v1/admin/users` (`onAddUserToggle` 폼)
- **권한**: admin
- **목적**: 사용자 생성.
- **요청**: `{ "login_id":"new.user", "name":"신규", "email":"new@corp.com", "role":"employee", "group_id":1, "department":"개발팀", "position_title":"사원" }`
  - `role='group_leader'` & `group_id` 없음 → `400`(CHECK `ck_users_leader_group`).
  - `login_id`/`email` 중복(미삭제) → `409 CONFLICT`.
  - `[확인필요]` **디자인 사용자 추가 폼 필드는 이름/아이디/소속그룹/역할 4개뿐이며 이메일·부서·직급 입력란이 없다.** 그러나 **이메일은 OTP/안내 메일 발송에 필수**다 → 이메일 입력 경로(추가 폼에 필드 추가 또는 별도 단계)를 확정해야 한다. `email`/`department`/`position_title`은 디자인 폼에 없는 보강이며, 특히 `email`은 누락 시 로그인 자체가 불가하므로 **중요한 갭**이다. `[확인필요: 이메일 입력 경로]`
- **응답**: `{ "ok": true, "data": { "id": 9, ... } }`
- **테이블**: `users`.

#### `PATCH /api/v1/admin/users/:userId`
- **권한**: admin
- **목적**: 역할/그룹/상태(활성·비활성)/프로필 수정. 디자인 `adminUsers`의 활성 토글·역할 변경.
- **요청**: `{ "role":"group_leader", "group_id":1, "status":"inactive" }`
  - `role='group_leader'`로 변경 시 `group_id` 필수(`ck_users_leader_group`) → 같은 트랜잭션 처리.
- **응답**: `{ "ok": true, "data": { ...user } }`
- **테이블**: `users`.

#### `DELETE /api/v1/admin/users/:userId`
- **권한**: admin
- **목적**: 소프트 삭제(`deleted_at`). 검수 이력 있는 그룹장은 하드 삭제 불가(`reviews.reviewer_id` RESTRICT) → 소프트 삭제만.
- **테이블**: `users`(`deleted_at`).

#### `GET /api/v1/admin/groups`
- **권한**: admin
- **목적**: 그룹 관리 목록(`adminGroups`: 그룹명/그룹장/구성원 수·목록).
- **응답**: `{ "ok": true, "data": [ { "id":1, "name":"개발팀", "leader":{"id":2,"name":"김도윤"}, "member_count":3, "members":[{"id":2,"name":"김도윤"},...] } ] }`
- **테이블**: `groups`, `users`.

#### `POST /api/v1/admin/groups` (`onAddGroupToggle` 폼)
- **권한**: admin
- **목적**: 그룹 생성.
- **요청**: `{ "name":"플랫폼팀", "leader_id": 5 /*선택, 상호참조 DEFERRABLE*/ }`
  - `name` 중복(미삭제) → `409 CONFLICT`.
- **응답**: `{ "ok": true, "data": { "id": 5, "name":"플랫폼팀", "leader_id": 5 } }`
- **테이블**: `groups`(필요 시 `users.group_id` 동기화).

#### `PATCH /api/v1/admin/groups/:groupId`
- **권한**: admin
- **목적**: 그룹명 수정.
- **테이블**: `groups`.

#### `PUT /api/v1/admin/groups/:groupId/leader` — **그룹장 변경**
- **권한**: admin
- **목적**: 그룹장 교체. **검수 권한 자동 이동**(별도 권한 테이블 없음 — `groups.leader_id`만 바꾸면 `requireReviewer`가 자동 반영, 데이터 모델 §5.4).
- **요청**: `{ "leader_id": 7 }`
- **불변식 보장**: **신임 그룹장은 해당 그룹 소속이어야 하며**, 역할 승격(`users.role='group_leader'`)과 `users.group_id` 세팅을 **단일 트랜잭션**으로 처리해 `ck_users_leader_group`(그룹장이면 group_id 필수)을 보장한다. 신임이 타 그룹 소속이면 같은 트랜잭션에서 `group_id`를 해당 그룹으로 동기화한다. (스키마 변경 불필요)
- **동작**: `groups.leader_id` 교체 → 신임 그룹장 `users.role='group_leader'`로 승격 + `group_id` 동기화(단일 트랜잭션) → 전임 그룹장은 역할 유지/강등 여부 정책. 진행 중 `pending_review` 보고서의 검수 권한은 **즉시 신임에게 이동**(라우팅은 현재 `leader_id` 기준이므로 자동).
- **응답**: `{ "ok": true, "data": { "group_id":1, "leader_id":7, "moved_pending": 6 } }`
- **`[보강]`**: 디자인의 "그룹장 변경"/"구성원 관리" 버튼은 핸들러가 없는 데드 버튼(변경 모달/플로우 미구현)이다. 본 엔드포인트(`leader_id`, `memberIds` 동기화)는 보강이다.
- **테이블**: `groups`(`leader_id`), `users`(역할·group_id 동기화).

#### `DELETE /api/v1/admin/groups/:groupId`
- **권한**: admin
- **목적**: 소프트 삭제. 소속 사용자 있으면 차단/재배치 안내. `[확인필요]`
- **테이블**: `groups`(`deleted_at`).

### 1.11 알림 (내부 트리거 · 백엔드 자동화 · 화면 아님)

> 모두 `requireInternal()`(서버-투-서버 시크릿). 스케줄러(cron/큐)가 호출. **KST·영업일·멱등성** 처리.
> **멱등키 정본**: `notifications.dedup_key` = `kind|user_id|report_date|section_kind|reminder_seq`. 안내/리마인더는 시간대(`section_kind`: plan/morning/afternoon/night) 구분이 필요하므로 `section_kind` 세그먼트를 포함한다(데이터모델 §3.18·04-백엔드 §3.3과 **세 문서 동일**). 안내는 `reminder_seq` 없음(예: `plan_link|42|2026-06-19|plan`), 리마인더는 회차 포함(예: `reminder|42|2026-06-19|morning|3`). `notifications` 테이블에는 `stage`/`review_id` 컬럼이 없으므로 멱등키에 쓰지 않는다.

#### `POST /api/v1/internal/notifications/dispatch`
- **권한**: internal
- **목적**: 발송 스케줄 실행. `kind`별 대상 산출 후 NCP Outbound Mailer 발송, 로그 기록.
- **요청**: `{ "kind":"plan_link", "report_date":"2026-06-19", "now":"2026-06-19T23:30:00Z" }`
  - `kind`: `plan_link`(08:30) / `morning_close_link`(11:50) / `afternoon_close_link`(17:50) / `night_link`(종료 10분 전).
- **동작**: 평일 판정 → 대상 사용자별 `daily_reports` 보장 + `report_links` 토큰 발급 → `notifications` upsert(`dedup_key`로 **중복발송 방지**, 중복이면 `status='skipped'`) → NCP 발송 → `sent_at`/`ncp_message_id`/`status='sent'|'failed'`.
- **응답**: `{ "ok": true, "data": { "kind":"plan_link", "queued":12, "skipped":3, "failed":0 } }`
- **테이블**: `daily_reports`, `report_links`, `notifications`, `users`.

#### `POST /api/v1/internal/notifications/reminders`
- **권한**: internal
- **목적**: **리마인더** — 발송 후 30분 내 미작성이면 5분 단위 재알림(완료까지).
- **요청**: `{ "report_date":"2026-06-19", "kind":"morning_close_link" }`
- **동작**: 직전 발송 후 경과·미작성 판정 → `reminder_seq` 증가하며 `notifications(kind='reminder')` 발송, `dedup_key`로 회차 중복 방지. **중단 조건**: 해당 시간대 `report_sections.is_locked=true`(마감완료) 또는 `daily_reports.status IN ('submitted','pending_review','resubmitted','approved','vacation')` 또는 당일 휴가 등록. 단순 편집 중(`section_status='writing'`)은 **미완으로 보아 계속 발송**한다(04-백엔드 §3.1과 동일 — `writing`을 중단 사유로 보지 않음).
- **응답**: `{ "ok": true, "data": { "sent": 4, "stopped": 9 } }`
- **테이블**: `notifications`, `daily_reports`, `report_sections`.

#### `POST /api/v1/internal/notifications/reject-notice`
- **권한**: internal (또는 `reviews/reject` 핸들러에서 직접 트리거)
- **목적**: **반려 안내 메일**(재작성 안내). 반려 발생 시 호출.
- **요청**: `{ "report_id": 201, "review_id": 56 }`
- **동작**: 작성자에게 재작성 링크(`report_links.token`) 포함 메일. `notifications(kind='reject_notice')`. 검수 회차당 1통이며, 멱등키는 정본 포맷(`reject_notice|owner_id|report_date|section_kind|reminder_seq` 패턴)에 맞춘다(`review_id`는 `notifications`에 컬럼이 없어 멱등키에 쓰지 않음).
- **응답**: `{ "ok": true, "data": { "sent": true } }`
- **테이블**: `notifications`, `report_links`, `reviews`, `daily_reports`.

#### `POST /api/v1/internal/notifications/night`
- **권한**: internal
- **목적**: **야간 종료 10분 전 재발송**. `daily_reports.night_branch=true` & `night_expected_end_at - 10min ≤ now` 대상.
- **요청**: `{ "now":"2026-06-19T12:20:00Z" }`
- **동작**: 대상 산출 → `notifications(kind='night_link')` 발송(멱등).
- **응답**: `{ "ok": true, "data": { "sent": 2 } }`
- **테이블**: `daily_reports`, `report_links`, `notifications`.

---

## 2) 화면 → 액션 → 엔드포인트 → 테이블 매핑표

> 디자인 핸들러(`renderVals`의 onClick들)를 실제 API에 1:1 대응. screen 값: `login|write|list|review|admin`.

### 2.1 로그인 (`screen='login'`)
| UI 요소 / 핸들러 | 사용자 액션 | 엔드포인트 | 건드리는 테이블 |
|---|---|---|---|
| 메일 링크 배너 / `/r/:token` 진입 | 메일 링크 클릭 → 당일 보고서 라우팅 | `GET /reports/today`(로그인 후) · `report_links.token` 검증 | `report_links`, `daily_reports` |
| 아이디 입력 `onIdInput` + OTP 입력 `onOtpInput` | 인증번호 요청(선행) | `POST /auth/otp/request` | `users`, `auth_otps`, `notifications`(login_otp) |
| 로그인 버튼 `onLoginSubmit`(`ready=idDone&&otpDone`) | 아이디+OTP 제출 | `POST /auth/login` | `auth_otps`, `sessions`, `users`, `daily_reports` |
| `unknown.user` 에러 | 없는 아이디 | (위) → `404 USER_NOT_FOUND` | `users` |
| OTP 불일치(≠7391) | 잘못된 OTP | (위) → `401 OTP_INVALID`, `attempt_count++` | `auth_otps` |
| 로그아웃 `onLogout` | 세션 종료 | `POST /auth/logout` | `sessions` |
| 프로필 모달 `onProfile` | 내 정보 보기 | `GET /auth/me` | `sessions`, `users`, `groups` |

> 데모 진입(`onDemoEnter`, "로그인 없이 둘러보기")은 디자인 검토용이며 실서비스 비노출. `[보강]`

### 2.2 작성 (`screen='write'`) — `writeMode` 전환
| UI 요소 / 핸들러 | 사용자 액션 | 엔드포인트 | 테이블 |
|---|---|---|---|
| 화면 로드 / `buildSections`·`stepperNodes` | 당일 보고서 로드 | `GET /reports/today` → `GET /reports/:id` | `daily_reports`, `report_sections`, `tasks`, ... |
| writeMode 칩 `onVariant`(morningPlan/morningClose/afternoonClose/nightClose) | 작성 단계 전환·자동저장 | `PATCH /reports/:id` `{write_mode}` | `daily_reports` |
| 업무 추가 토글 `onToggleAdd` + 프로젝트 입력 `onAddProject` | 자동완성 조회 | `GET /tasks/recent?project=` | `tasks`(읽기) |
| 프로젝트칩 `onPickProject` / 최근업무 `onPickRecent` | 추천 채우기 | `GET /tasks/recent` | `tasks`(읽기) |
| "어제 미완료 불러오기"(모든 editable 섹션, morningPlan 포함) | 이월 후보 조회 | `GET /tasks/carryover` | `daily_reports`,`tasks` |
| 업무 저장(추가 폼 "추가") | 업무 생성(+이월 link) `[보강: 디자인 데모는 onCancelAdd로 닫기만, 실서비스는 POST tasks]` | `POST /reports/:id/sections/:sid/tasks` | `tasks`, `task_links` |
| 파일행 `onAddFileRow` / URL행 `onAddUrlRow` | 첨부 업로드+연결 | `POST /uploads` → `POST /tasks/:tid/attachments` | `task_attachments` |
| 첨부 제거 `onRemoveFileRow`/`onRemoveUrlRow` | 첨부 삭제 | `DELETE /tasks/:tid/attachments/:id` | `task_attachments` |
| 업무 상태/소요시간/지연사유 수정 | 업무 편집 | `PATCH /reports/:id/tasks/:tid` | `tasks` |
| 개별 마감 버튼 `onCloseTask`(`canClose`) | 업무 완결 | `POST /reports/:id/tasks/:tid/close` | `tasks` |
| 강제 마감 `onForceClose`(`dataset.titles`) | 미완 일괄 완결 | `POST /reports/:id/sections/:sid/force-close` | `tasks`, `report_sections` |
| 잠긴 시간대 펼치기/접기 `onToggleLocked`(`업무 펼쳐 보기 ▾`/`접기 ▴`) | (UI 전용, DB 미저장) | — | — |
| "오전 마감하기" `writePrimary` | 시간대 마감·잠금 | `POST /reports/:id/sections/:sid/close` | `report_sections`, `tasks` |
| 야간 분기 `onNightNo`/`onNightYes` + 사유 `onNightReason` | 야간 있음/없음·사유 (`branch:'yes'\|'no'\|null` → `night_branch boolean`) | `PATCH /reports/:id` `{night:{branch,reason,expected_end_at}}` | `daily_reports` |
| 커뮤 항목별 인라인 "＋ 첨부파일·코멘트" | 항목 첨부 추가 | `POST /uploads` → `POST /communications/:commId/attachments` | `communication_attachments` |
| 커뮤 신규 항목 입력 `[보강/확인필요: 디자인 미수록]` | 커뮤 기록 | `POST /reports/:id/communications` | `communications` |
| "오늘 커뮤니케이션 없음" 플래그 | comm_none 설정 | `PATCH /reports/:id` `{comm_none:true}` | `daily_reports` |
| 일일 코멘트 입력(`0/500`) | 코멘트 저장 | `PUT /reports/:id/daily-comment` | `daily_comments` |
| 휴가로 전환 `onGoVacation`(morningClose/afternoonClose) + "휴가로 제출" | 휴가 처리 | `PUT /reports/:id/vacation` | `vacations`, `daily_reports`, `report_sections` |
| 휴가 취소 `onExitVacation` | 휴가 해제(→morningClose) | `DELETE /reports/:id/vacation` | `vacations`, `daily_reports` |
| "최종 제출"/"계획 제출"/"야간 계획 저장"/"재제출하기" `writePrimary` | 제출(야간있음=2단계) | `POST /reports/:id/submit` | `daily_reports`, `report_sections`, `review_events` |
| 반려 후 재작성 진입 `goWriteRejected`(rejected 모드) | 지목 시간대만 편집 | (서버가 `reject_targets`로 섹션 잠금 제어; 미지목 수정 시 `409 NOT_REWORK_TARGET`) | `report_sections`, `reject_targets` |

> 야간 토글(`showNightToggle`)은 디자인 코드상 `nightClose` 모드 전용으로 렌더되나, 도메인 계약은 "afternoonClose/nightClose에서 야간 분기"다 — 이 충돌은 `[확인필요]`(01-기능명세 §3.2/§4.5, 04-백엔드 §1과 함께 점검). API상 야간 분기 저장(`PATCH /reports/:id`)은 모드와 무관하게 동작.

### 2.3 목록 (`screen='list'`)
| UI 요소 / 핸들러 | 사용자 액션 | 엔드포인트 | 테이블 |
|---|---|---|---|
| 직원/관리자 뷰 `onVariant`(employee/manager) | 뷰 전환 | `GET /reports?view=employee\|manager` | `daily_reports`,`tasks`,`reviews`,`users` |
| 상태 탭 `onListTab`(all/none/delay/pending/rejected/approved) | 필터(status·review_status 2축 매핑 §0.5) | `GET /reports?status=` | (동일) |
| 통계 카드 `listStats` | 집계 표시 | `GET /reports` → `meta.stats` | `daily_reports`,`tasks` |
| 검색 `searchPlaceholder` | 이름·업무 검색 | `GET /reports?q=` | (동일) |
| `mgrRows` "검수" 버튼 | 검수 화면 이동 | `GET /reviews/:reportId` | (검수 §2.4) |
| `mgrRows`/`empRows` "보기" 버튼 | 읽기 보기 | `GET /reports/:reportId` | `daily_reports` 외 |

### 2.4 검수 (`screen='review'`) — `reviewVariant`
| UI 요소 / 핸들러 | 사용자 액션 | 엔드포인트 | 테이블 |
|---|---|---|---|
| 검수 화면 로드(`reviewTasksArr`/`reviewComm`/`reviewMetaText`) | 상세 로드 | `GET /reviews/:reportId` | `daily_reports`,`report_sections`,`tasks`,`communications`,`reviews`,`reject_targets`,`review_events` |
| 상태 배지(검수대기+재제출+지연 복수) `status_badges` | (표시) | `GET /reviews/:reportId` | `daily_reports`,`reviews`,`tasks` |
| 큐 네비 "검수 대기 8건 중 3번째"(`reviewQueuePos`, employee 변형 숨김) | 이전/다음 | `GET /reviews/queue` | `daily_reports`,`tasks`,`reviews`,`users` |
| 승인 버튼 `onApprove`(`reviewVariant='approved'`) | 승인 | `POST /reviews/:reportId/approve` | `reviews`,`daily_reports`,`review_events` |
| 반려 모달 열기 `onOpenReject` | 모달 표시 | (클라이언트) | — |
| 사유 템플릿 `onPickRejectTemplate`(`rejectTemplates`) | 템플릿 선택(코멘트 프리필) | (클라이언트 → reject 요청의 `template`) | — |
| 대상 시간대 지목(단일 select: 전체/오전/오후/야간) | scope 선택 `[보강: 디자인 단일, API scopes[] 복수]` | (reject 요청 `scopes[]`) | — |
| 반려 제출 `onSubmitReject`(빈 코멘트 차단) | 반려 | `POST /reviews/:reportId/reject` | `reviews`,`reject_targets`,`daily_reports`,`report_sections`,`review_events`,`notifications` |
| 야간 사유 표시 `reviewNightReason` | (읽기) | `GET /reviews/:reportId`의 `night_reason` | `daily_reports` |
| 휴가 검수(`reviewIsVacation`) | 휴가 승인/반려 | `POST /reviews/:reportId/approve\|reject` | `reviews`,`vacations`,`daily_reports` |
| 검수 이력 타임라인(상세 응답 포함) | 이력 조회 | `GET /reviews/:reportId`(또는 `.../timeline` 보강) | `review_events`,`reviews` |
| AI 분석 패널(`aiMetrics`, `reviewShowAI`/`reviewAnalyzing`) | **v1 미개발(영역 예약)**, 휴가/analyzing 변형 숨김 | (표시 영역만) `ai_panel.deferred=true`, `review_show_ai` | `qualitative_metrics`(빈 자리, v1 deferred) |

### 2.5 관리 (`screen='admin'`) — `adminTab`
| UI 요소 / 핸들러 | 사용자 액션 | 엔드포인트 | 테이블 |
|---|---|---|---|
| 사용자/그룹 탭 `onVariant`(users/groups) | 탭 전환 | `GET /admin/users` · `GET /admin/groups` | `users`,`groups` |
| 사용자 목록 `adminUsers` | 조회 | `GET /admin/users?q=&role=&group_id=&status=` | `users`,`groups` |
| 사용자 추가 토글 `onAddUserToggle` + 저장 | 생성 `[확인필요: 폼에 이메일 입력란 없음, OTP 발송에 이메일 필수]` | `POST /admin/users` | `users` |
| 활성/비활성·역할·그룹 변경 | 수정 | `PATCH /admin/users/:userId` | `users` |
| 사용자 삭제 | 소프트 삭제 | `DELETE /admin/users/:userId` | `users` |
| 그룹 목록 `adminGroups`(그룹장/구성원) | 조회 | `GET /admin/groups` | `groups`,`users` |
| 그룹 추가 토글 `onAddGroupToggle` + 저장 | 생성 | `POST /admin/groups` | `groups` |
| 그룹명 수정 | 수정 | `PATCH /admin/groups/:groupId` | `groups` |
| **그룹장 변경**(검수 권한 이동) `[보강: 디자인은 데드 버튼, 모달 미구현]` | 그룹장 교체 | `PUT /admin/groups/:groupId/leader` | `groups`,`users` |
| 구성원 관리 `[보강: 디자인 데드 버튼]` | 구성원 동기화 | `PATCH /admin/groups/:groupId` `{memberIds}` | `groups`,`users` |
| 그룹 삭제 | 소프트 삭제 | `DELETE /admin/groups/:groupId` | `groups` |

### 2.6 백엔드 자동화 (화면 아님 · 스케줄러)
| 트리거 | 시점(KST·평일) | 엔드포인트 | 테이블 |
|---|---|---|---|
| 계획 링크 | 08:30 | `POST /internal/notifications/dispatch {kind:'plan_link'}` | `daily_reports`,`report_links`,`notifications` |
| 오전마감 링크 | 11:50 | `... {kind:'morning_close_link'}` | (동일) |
| 오후마감 링크 | 17:50 | `... {kind:'afternoon_close_link'}` | (동일) |
| 야간 재발송 | 종료 예상 10분 전 | `POST /internal/notifications/night` | `daily_reports`,`report_links`,`notifications` |
| 리마인더 | 발송 후 30분 내 미작성 → 5분 단위(`writing`은 미완으로 보아 계속) | `POST /internal/notifications/reminders` | `notifications`,`daily_reports`,`report_sections` |
| 반려 안내 | 반려 직후 | `POST /internal/notifications/reject-notice` | `notifications`,`report_links` |
| 로그인 OTP | 로그인 요청 시 | `POST /auth/otp/request`(내부 발송) | `auth_otps`,`notifications` |

---

## 3) 인증 · 세션 · 권한 가드 · 에러 · 페이지네이션 상세

### 3.1 인증/세션 구현 메모
- **세션 쿠키**: `sd_session`(HttpOnly·Secure·SameSite=Lax). 값은 랜덤 토큰, DB에는 `sessions.token_hash`(SHA-256)만 저장. 만료 `expires_at`, 로그아웃 `revoked_at`.
- **OTP**: `auth_otps.code_hash`에 해시 저장(평문 금지). `expires_at`(5분 = `expires_in_sec:300`, 04-백엔드 §2.5와 통일), `attempt_count`로 5회 초과 시 `429 RATE_LIMITED`. 성공 시 `consumed_at`. 안내 메일 동봉형 OTP의 유효시간 트레이드오프(메일 수신 후 작성 시점까지 유효)는 `[확인필요]`.
- **미들웨어**(`middleware.ts`): `/api/v1/**`(공개 경로 제외)에서 세션 1차 확인 → 핸들러에서 역할/소유/검수 2차 확인(이중 가드). `/api/v1/internal/**`는 세션 미들웨어를 건너뛰고 `X-Internal-Token`만 검사.
- **로그인 직후 라우팅**: `auth/login` 성공 시 당일 KST 영업일 보고서를 보장(`upsert`)하고 `redirect: "/reports/today"` 반환("로그인 시 당일 보고서로 바로 이동").

### 3.2 권한 가드 매트릭스
| 가드 | 통과 조건 | 위반 시 |
|---|---|---|
| `requireAuth` | 유효 세션 + `users.status='active'` + `deleted_at IS NULL` | `401 UNAUTHENTICATED` |
| `requireSelfReport(reportId)` | `daily_reports.owner_id = me.id` | `403 FORBIDDEN` |
| `requireSectionEditable(sectionId)` | `report_sections.is_locked = false` (rejected 모드는 `reject_targets`에 포함된 섹션만) | `409 SECTION_LOCKED` / `409 NOT_REWORK_TARGET` |
| `requireReviewer(reportId)` | `groups.leader_id = me.id` where `groups.id = daily_reports.group_id` | `403 FORBIDDEN` |
| `requireRole('admin')` | `me.role='admin'` | `403 FORBIDDEN` |
| `requireInternal` | `X-Internal-Token` 일치 | `401 UNAUTHENTICATED` |

- **검수 권한 자동 이동**: 권한 테이블이 없으므로 그룹장 변경(`PUT /admin/groups/:id/leader`)은 `groups.leader_id`만 바꾸면 끝. 진행 중 `pending_review` 보고서도 `requireReviewer`가 항상 현재 `leader_id`를 보므로 즉시 신임 그룹장에게 이동(데이터 모델 §5.4).
- **검수 자기 보고서 처리**: 그룹장이 자기 그룹의 유일 그룹장이면 **본인 보고서의 검수자가 부재**한다(자기 검수 불가 + admin 검수 불가(01 §1.1) + 타 그룹장 권한 없음). `requireReviewer`에서 `owner_id = me.id`인 경우의 처리(① self-review 면제로 자동 승인, 또는 ② 상위 검수자/admin 위임)를 명문화해야 한다. **세 문서에 걸친 미해소 모순**으로, 한 정책으로 확정 필요(02 §5.4·01 §1.1/§1.2와 함께 정렬). `[확인필요: 그룹장 본인 보고서 검수자 — 자동승인 또는 admin 위임 중 택1]`

### 3.3 에러 응답 규약 (핵심 케이스)
| 상황 | 응답 |
|---|---|
| OTP 4자리 미완성 | 클라이언트에서 차단(`ready=false`, 버튼 비활성) → **서버 호출 없음** |
| 반려 사유 누락(`onSubmitReject` 빈 코멘트) | `400 VALIDATION_ERROR` `{ "fields": { "comment": "required" } }` |
| 반려 지목 시간대 미선택 | `400 VALIDATION_ERROR` `{ "fields": { "scopes": "at_least_one" } }`(디자인 단일 select에선 항상 1개라 미발생 가능) |
| 업무명 누락 | `400 VALIDATION_ERROR` `{ "fields": { "title": "required" } }` |
| 30분 단위 위반(`planned_duration_min`) | `400 VALIDATION_ERROR` `{ "fields": { "planned_duration_min": "multiple_of_30" } }` |
| 지연인데 사유 없음 | `400 VALIDATION_ERROR` `{ "fields": { "hold_reason": "required_when_hold" } }` |
| 야간 '있음'(`branch='yes'`) & 사유 없음 | `400 VALIDATION_ERROR` `{ "fields": { "night.reason": "required" } }` |
| 일일 코멘트 500자 초과 | `400 VALIDATION_ERROR` `{ "fields": { "body": "max_500" } }` |
| 잠긴 시간대 수정 | `409 SECTION_LOCKED` |
| 미지목 시간대 재작성(rejected) | `409 NOT_REWORK_TARGET` |
| (owner,date) 보고서 중복 | `409 CONFLICT` |
| 이미 승인된 보고서 재검수 | `409 CONFLICT` |
| 잘못된 상태에서 제출 | `422 STATE_INVALID` |
| OTP 불일치 / 만료 / 과다 | `401 OTP_INVALID` / `401 OTP_EXPIRED` / `429 RATE_LIMITED` |
| 없는 아이디 | `404 USER_NOT_FOUND` |

### 3.4 페이지네이션·필터·정렬 규약 (재확인)
- 목록 엔드포인트(`GET /reports`, `GET /reviews/queue`, `GET /admin/users`, `GET /admin/groups`): `page`(1-base)·`size`(기본 20, 최대 100)·`sort`(`field:asc|desc`, 다중 콤마)·`q`(검색)·`date`/`from`/`to`(KST 날짜).
- `GET /reports`: `view=employee|manager`, `status=`(뷰별 enum 위 §0.5, report_status/review_status 2축 매핑). **그룹장은 자기 그룹 자동 스코프, admin은 스코프 강제 없이 전체**(선택적 `group_id=` 필터). admin은 `group_id` NULL일 수 있어 "자기 그룹" 개념이 없음(§0.5·§1.9·01 §1.1 일치).
- `GET /reviews/queue`: 자기 그룹 `pending_review|resubmitted`만. 응답 `meta.queue_total`으로 "검수 대기 N건" 카운트, 항목 순서 인덱스로 "M번째" 산출.
- `GET /tasks/recent`: `project`(부분일치), `limit`(기본 5). `GET /tasks/carryover`: `for_date`.
- 응답 `meta`: `{ page, size, total, totalPages, ...(stats/queue_total 등 도메인 부가) }`.

---

## 4) 범위 밖 / 예약 (v1 deferred)
- **정성 지표(효율성/연속성/연관성) AI 분석**: 디자인의 검수 우측 AI 분석 패널은 영역만 예약("이번 버전 미개발 · 영역 예약"). `GET /reviews/:reportId` 응답의 `ai_panel.deferred=true`/`metrics:[]`로 자리만 내려주고, `review_show_ai=false`(휴가/analyzing 변형)면 미표시한다. `qualitative_metrics` 테이블은 스키마만 존재, **산출/표시 로직 및 전용 API는 v1 범위 외**. 향후 `POST /internal/metrics/compute` 형태로 확장 예정(미구현). `[확인필요: v2]`
- **`analyzing` reviewVariant**: 디자인 enum에는 존재하나(`reviewShowAI`/`reviewAnalyzing` 파생) AI 패널이 "분석 중"일 때만 쓰이므로 **v1 미사용 변형**(deferred). enum 자체는 디자인에 실존하므로 누락 처리하지 않고 위 §1.8에 명시.
