# 적대적 검증 & 수정 현황

> 멀티에이전트 적대적 검증(6차원 헌팅 → 독립 반증 → 종합) 결과 **33건 발견 / 49 에이전트**.
> 확정 고위험을 수정하고 회귀 테스트로 고정. 아래는 수정/구현/보류 현황. 원문 종합 리포트는 맨 아래.

## ✅ 수정 완료 (보안·정합성)
| 발견(심각도) | 수정 | 검증 |
|---|---|---|
| 그룹장 셀프 검수 가능 (High) | `canReview` 본인 보고서 차단 + 검수 큐에서 본인 제외 | `tests/unit/review-auth.test.ts` |
| 승인/반려 상태가드·행잠금 부재, 이중검수/임의전이 (Critical) | `assertPending`(FOR UPDATE + status='검수대기'), 라우트 409 매핑 | e2e 재승인 409 |
| 휴가 우회: vacationType만으로 진행 보고서 휴가 제출 (High) | `advanceReport` 마감/진행 보고서 휴가 전환 거부 → 409 | e2e 휴가 우회 409 |
| 반려 사이클 비지목 섹션 신규생성 우회 (High) | `addTask` 반려 중 '재작성' 섹션만 허용, 재제출 시 전 섹션 잠금 | (가드) |
| SESSION_SECRET 운영 폴백 (High) | 운영 런타임 약한 시크릿 부팅 차단(빌드단계 제외) | 빌드 통과 |
| 로그인 레이트리밋/락아웃 전무 (Critical) | loginId+IP 20회/5분 인메모리 레이트리밋(429) | — |
| date 파라미터 미검증 → 500/임의 보고서 양산 (High) | 형식 검증 + 오늘만 자동생성, 그 외 기존만 조회 | — |
| `Number(id)` NaN → 500 (Medium) | 모든 라우트 `parseId` 양의정수 검증(400) | e2e |
| 완결율 집계가 plan 포함 (High) | 집계에서 `kind <> 'plan'` 제외 | — |
| 야간 2단계 제출 라벨 붕괴 (High) | afternoonClose+yes='야간 계획 저장', nightClose='최종 제출' | `tests/unit/mode.test.ts` |
| view(제출후) 보고서에도 필드 저장 (Medium) | advance가 view 모드면 즉시 no-op 반환 | — |
| login_code char(4) 패딩 (Medium) | varchar(8) 전환 + 비교 시 trim | — |
| IDOR/forbidden/locked 경로 미검증 (High, 테스트공백) | e2e 추가: IDOR 403 / 잠금섹션 400 / 미인증 401 | `tests/e2e/security.spec.ts` |

## ✅ 추가 구현 (실사용 핵심)
- 커뮤니케이션 기록 **추가** UI/API + '오늘 커뮤니케이션 없음' 토글 (원 보고 프로세스 4번 항목)
- **임시저장**(일일코멘트/야간사유/커뮤없음) — 제출 전 저장

## ⏳ 보류 (사용자 지시/범위) — 향후
- **자동 OTP 발급·메일 인증**: 사용자가 "지금은 고정값(DB 4자리) 처리, OTP 추후"로 지시 → 고정 코드 유지. 무차별 대입은 레이트리밋으로 완화. (auth_otps 스키마는 예약)
- **메일 발송/스케줄러/리마인더**: 발송 cadence(08:30/11:50/17:50/야간-10분)·30분후 5분 재알림·반려안내·NCP 실발송 미연결. 메일러 추상화(Log/Ncp HMAC)는 구현됨. 앱은 링크 없이도 수동 사용 가능.
- 어제 미완료 불러오기 / 반복 업무 / 첨부파일(파일·URL)
- 야간 종료 예상시각 정밀 입력 + 10분전 재발송(스케줄러 의존)
- 스키마 도메인 CHECK/교차 FK 강화(정성지표 AI는 v1 범위 외)
- 정성 지표(효율성·연속성·연관성) AI 산출: 검수 화면에 자리 예약(v1 미개발)

## 테스트 커버리지
- 단위 39: 상태메타·완결율·스테퍼·모드전이·크립토·검수권한(셀프차단)
- e2e 17: 로그인/로그아웃·오류, 작성흐름·개별마감, 목록(관리자), 검수 승인/반려·재작성, 관리, RBAC 리다이렉트, IDOR/잠금/휴가우회/재승인/미인증, 커뮤니케이션·임시저장

---

# 부록 · 종합 리포트(워크플로 원문)

I have verified all the critical claims. The evidence confirms:

- **Self-review (canReview)**: seed.ts:41 `kim.doyun` is `group_leader` of 개발팀, and leaders loop (64-72) sets 개발팀's `leader_user_id = uid["kim.doyun"]`. So a leader's own report has `owner.leader_user_id === reviewer.id` → canReview returns true (review.ts:29). Confirmed.
- **No status guard**: approveReport/rejectReport (review.ts:46-77) update `WHERE id=$1` only; routes don't check status. getReviewOwner doesn't select status. Confirmed.
- **Vacation bypass**: advanceReport line 142 `isVac = report.is_vacation || !!input.vacationType`, and computeWriteMode checks `isVacation` (mode.ts:17) before section-close checks. But note: `computeWriteMode` returns "view" for 검수대기/승인/제출완료/재제출 BEFORE the vacation branch (mode.ts:15-16), so vacation only triggers for editable statuses (미작성/작성중). The claim that a 작성중 report with locked plan/morning can be forced to vacation is valid. Confirmed.
- **GET write side-effect + no date validation**: page.tsx:16 calls getOrCreateReport with raw `date`, which INSERTs (reports.ts:79-82). No format validation. Confirmed.
- **Aggregation counts plan**: list.ts:36-39 `FROM tasks GROUP BY report_id` with no section filter. plan tasks (status '계획') are counted in total but never in done. Confirmed.
- **Mail/scheduler absent**: `.send(` never called anywhere; no cron/tick route. Confirmed.
- **Number(id) unguarded**: all routes `Number(id)` with no NaN check. Confirmed.
- **SESSION_SECRET fallback**: env.ts:12 `?? "dev-change-me-please"`, no prod guard. Confirmed.
- **Fixed code / brute force**: login_code DEFAULT '1234', no rate limit, request-otp returns ok for all. Confirmed.

Now I'll synthesize the prioritized report, merging the many duplicate self-review and status-guard entries.

---

# Seeding 보안·정합성 검증 리포트 — 실사용 투입 전 우선순위 종합

검증 방법: 적대적 검증으로 제출된 이슈를 실제 코드(파일:라인)로 재대조했다. 중복(자기검수 4건, 검수 상태가드 5건, OTP/고정코드 3건 등)은 단일 항목으로 병합했고, 코드 근거가 확인된 것만 남겼다. 거짓양성으로 판정한 항목은 5절에 분리 기재했다.

---

## 1) 요약 — 가장 시급한 3가지

1. **인증이 사실상 부재**다. 전 계정이 고정 4자리 `login_code`(기본값 `'1234'`)로만 로그인되고, 레이트리밋·락아웃·만료·OTP 발송이 전혀 없다. `login_id`는 이름 기반(`kim.doyun`)으로 열거 가능하며, 관리자 `park.sora` 포함 임의 계정을 1만 조합 전수조사로 수초 내 탈취할 수 있다. (`db/migrations/0002_login_code.sql:2`, `src/lib/auth/service.ts:27-34`, `src/app/api/auth/login/route.ts`)

2. **검수(승인/반려)에 상태 전제조건과 행잠금이 없다.** `approveReport`/`rejectReport`는 보고서가 '검수대기'인지 확인하지 않고 무조건 상태를 덮어쓴다(`WHERE id=$1`만). 이미 승인된 보고서를 다시 반려해 잠긴 섹션을 풀거나, 제출도 안 된 '작성중' 보고서를 승인하거나, 두 검수자가 동시 처리해 `approved+rejected`가 모두 남는 모순 상태를 만들 수 있다. (`src/lib/data/review.ts:46-77`)

3. **그룹장이 자기 보고서를 셀프 승인/반려할 수 있다.** `canReview`가 `owner.leader_user_id === reviewer.id`만 보는데, 그룹장은 자기 그룹의 리더이자 구성원이므로 자기 보고서가 이 조건을 만족한다. 4-eyes(2인 검수) 통제가 무너진다. (`src/lib/data/review.ts:27-31`)

---

## 2) Critical / High (코드로 확정)

### C1. 인증 부재 — 전 계정 고정 `'1234'` + 무제한 시도 (Critical)
- **파일**: `db/migrations/0002_login_code.sql:2`, `src/lib/auth/service.ts:13-34`, `src/app/api/auth/login/route.ts:6-22`, `src/lib/data/admin.ts:43`, `scripts/seed.ts:54-61`
- **왜 위험**: `0002`가 `login_code char(4) NOT NULL DEFAULT '1234'`로 전원에게 `'1234'`를 부여한다. `seed.ts`는 `login_code`를 지정하지 않아 시드 사용자 전원이 `'1234'`다. `admin.ts:43`도 `input.loginCode ?? "1234"`로 동일 기본값을 쓴다. `verifyOtp`(service.ts:31)는 `safeEqual(otp, user.login_code)`만 수행 — 만료·소비·회전 개념이 없는 영구 고정값이다. `request-otp`는 존재하는 모든 loginId에 `{ok:true}`를 반환해 계정 존재까지 확인된다. 코드공간 4자리(1만)에 락아웃·레이트리밋·지수백오프·CAPTCHA가 전무하다(`attempts` 컬럼은 `0001_init`에 있으나 `grep` 결과 코드 사용처 0건). OTP가 아니라 '전 계정 공유 비밀번호'에 가깝다.
- **구체적 수정**:
  - `requestOtp`에서 `generateOtp()` 난수 4자리 생성 → `hashSecret`로 해시해 `auth_otps(otp_hash, expires_at=now()+10분)` insert, `mailer().send(otpEmail(...))` 호출.
  - `verifyOtp`는 최신 미소비·미만료 행과 비교, `attempts` 증가, N회(예 5) 초과/만료 시 거부, 성공 시 `consumed_at` 설정.
  - `login_code`/DEFAULT `'1234'` 제거(또는 운영 게이트로 차단). 약한 코드 금지 검증.
  - login route에 계정+IP 단위 윈도우 레이트리밋(분당 5회 등)과 일관된 401·지연 적용.

### C2. 검수 승인/반려에 상태 가드·행잠금 부재 (Critical)
- **파일**: `src/lib/data/review.ts:46-77`, `src/app/api/reviews/[id]/approve/route.ts:5-15`, `src/app/api/reviews/[id]/reject/route.ts:7-23`
- **왜 위험**: `approveReport`는 `UPDATE daily_reports SET status='승인' WHERE id=$1`(48행), `rejectReport`는 `SET status='반려' WHERE id=$1`(70행)로 **현재 status 무관 강제 전이**한다. `getReviewOwner`(14-24)는 `status`를 SELECT조차 하지 않으며 라우트는 `canReview`만 본다. 결과:
  1. 직원이 제출하지도 않은 '작성중'/'미작성' 보고서를 '승인' 처리 → 제출 절차 우회.
  2. 이미 '승인'된 보고서를 다시 '반려'하면 `rejectReport`가 `report_sections.locked=false`로 풀어(66-67행) 직원이 재편집 가능한 상태로 되돌아감 → 정합성 붕괴.
  3. `SELECT ... FOR UPDATE` 잠금이 없어 admin+group_leader 동시 호출 시 마지막 쓰기가 이김(race). `report_events`에는 `approved`와 `rejected`가 모두 남는 모순 이력이 쌓인다.
  - e2e(review.spec)는 항상 '검수대기' 시드(`seed.ts:154,190`)에서 1회만 호출하는 happy-path라 이 결함을 절대 잡지 못한다.
- **구체적 수정**: 두 함수 모두 트랜잭션 진입 직후 `SELECT status FROM daily_reports WHERE id=$1 FOR UPDATE`로 행을 잠그고 `'검수대기'`가 아니면 `throw('NOT_PENDING')`. UPDATE에도 `AND status='검수대기'`를 넣어 `rowCount==0`이면 에러. `getReviewOwner`가 `status`를 반환하게 하고 라우트에서 409/400으로 매핑.

### C3. 휴가 분기가 마감·잠금된 작업을 무시하고 우선 적용 (High)
- **파일**: `src/lib/domain/mode.ts:14-23`, `src/lib/data/report-mutations.ts:142-143, 207-214`, `src/app/api/reports/[id]/advance/route.ts`
- **왜 위험**: `advanceReport`는 `isVac = report.is_vacation || !!input.vacationType`(142행)로 **입력에 `vacationType`만 실으면** 휴가로 간주한다. `computeWriteMode`는 편집가능 상태(미작성/작성중)에서 섹션 마감 검사보다 `isVacation`을 먼저 본다(mode.ts:17). 따라서 plan/morning을 작성·마감(locked, '마감완료')한 '작성중' 보고서에 `vacationType`만 보내면 vacation 케이스로 진입해 `is_vacation=true`를 박고 곧장 '검수대기'로 제출된다(207-213행). 게다가 vacation 케이스는 **어떤 섹션도 lockSection하지 않으므로** 잠긴 실제 업무 섹션·tasks가 그대로 남아, 검수·목록의 휴가 표기와 실제 데이터가 모순된다. UI(vacationMode 토글)는 막지만 서버는 무방비 — 위조 요청으로 트리거 가능.
- **구체적 수정**: vacation 전이 전 '아직 어떤 섹션도 마감되지 않았고 status가 미작성/작성중'인지 검증(예: `secMap`의 어떤 값도 '마감완료' 아님). `report.is_vacation`이 아니면서 진행된 보고서면 `input.vacationType`만으로 `isVac`을 올리지 말 것. vacation 제출 시에도 모든 섹션을 lockSection하여 unlocked 잔존 제거.

### C4. 자기검수 허용 — 그룹장 셀프 승인/반려 (High)
- **파일**: `src/lib/data/review.ts:27-31, 86-100`
- **왜 위험**: `canReview`의 group_leader 분기는 `owner.leader_user_id === reviewer.id`만 검사(29행). `seed.ts:41`에서 `kim.doyun`은 개발팀 employee이자 group_leader이고, 64-72행 leaders 루프가 개발팀 `leader_user_id = uid["kim.doyun"]`로 설정한다. 즉 그룹장 본인 보고서의 `owner.leader_user_id`가 자기 id가 되어 `canReview`가 true → `/api/reviews/[id]/approve|reject`로 자기 일일보고를 스스로 승인/반려 가능. `reviewQueueForReviewer`의 group_leader 쿼리(95-99행)도 `g.leader_user_id=$1`만 거르고 `u.id<>$1`을 빼서 본인 보고서가 검수 큐에 노출된다.
- **구체적 수정**: `canReview` 최상단에 `if (owner.user_id === reviewer.id) return false;` 추가(`ReviewOwner`는 이미 `user_id` 포함). 큐 쿼리에 `AND u.id <> $1` 추가. 그룹장 본인 보고서는 admin이 검수하도록 정책 정의.

### C5. 본인 보고서를 GET만으로 무제한 생성 + date 미검증 500 (High)
- **파일**: `src/app/(app)/report/[date]/page.tsx:13-16`, `src/lib/data/reports.ts:71-89`
- **왜 위험**: 서버 컴포넌트가 URL의 raw `date`를 검증 없이 `getOrCreateReport(user.id, date)`로 넘기고(page.tsx:16), 이 함수는 없으면 `INSERT INTO daily_reports ... ('작성중')` + plan 섹션 생성을 수행한다(reports.ts:79-86). 파라미터 바인딩이라 SQL 인젝션은 없으나:
  1. `'2026-13-40'`·`'hello'` 같은 잘못된 문자열은 Postgres date 캐스팅 에러 → try/catch 없어 처리되지 않은 500.
  2. **GET 네비게이션만으로 행이 INSERT**되므로 크롤러·프리패치·공격자가 `/report/2099-01-01` 등 임의 날짜를 호출하면 보고서가 무제한 생성된다(GET에서 쓰기 부작용 자체가 데이터 오염 경로). 유효 날짜 범위(미래 금지/평일 등) 검증도 없다.
- **구체적 수정**: 진입 시 `/^\d{4}-\d{2}-\d{2}$/` + 실제 유효일자(미래 금지 정책) 검증, 불일치 시 `notFound()`/`redirect(todayKstISO())`. 행 생성은 GET이 아니라 명시적 POST 액션에서만 일어나도록 분리.

### C6. 반려 후 재제출 시 비지목 신규 섹션 우회 편집 (High)
- **파일**: `src/lib/data/review.ts:65-69`, `src/lib/data/report-mutations.ts:50-58, 198-203`
- **왜 위험**: 반려는 지목 시간대 중 `locked=true`인 섹션만 '재작성/locked=false'로 푼다(review.ts:65-67). 그런데 `addTask`/`closeTask`/`updateTask`는 보고서 `status`가 '반려'인지, 섹션이 '재작성' 지목 대상인지 보지 않고 오직 `s.locked`만 검사한다(report-mutations.ts:58,95,116). 재작성 중 직원이 `addTask`로 night 등 새 섹션을 만들면 `ensureSection`이 `locked=false, status='작성중'`으로 생성한다(57,12-16행). 재제출 분기는 `status='재작성'`인 섹션만 재잠금하므로(199-203행) 이 신규 섹션은 잠기지 않은 채 제출된다 → 지목되지 않은 시간대를 새로 만들어 자유 편집·제출. 잠긴 섹션 우회의 변형이다.
- **구체적 수정**: status='반려' 사이클에서는 신규 섹션 생성 및 비-'재작성' 섹션 편집을 금지. 변이 함수에 `JOIN daily_reports`로 status 확인 후 '반려'면 대상 섹션 status가 '재작성'일 때만 허용. 재제출 시 신규 미잠금 섹션까지 일괄 잠금.

### C7. 완결율/지연 집계가 plan 섹션 업무를 분모에 포함 (High)
- **파일**: `src/lib/data/list.ts:35-40, 65-70`
- **왜 위험**: `listScopeReports`(매니저 현황)·`listMyReports`(직원 이력)의 집계 서브쿼리가 `FROM tasks GROUP BY report_id`로 **섹션 구분 없이** 전 task를 센다(36-39, 66-69행). 작성 플로우상 morningPlan에서 추가한 업무는 plan 섹션(status='계획')으로 들어가고, morningClose에서 동일 업무를 morning/afternoon에 별도 row로 다시 추가한다(plan task를 이월/완결시키는 로직 없음; `carried_from_task_id` 미사용). 결과 `total`에 영구 '계획' 상태 plan task가 포함되어 `done/total` 완결율과 매니저 통계가 실제보다 낮게 왜곡된다. 시드(jung.yuna/park.seojun)는 plan 섹션이 없어(`seed.ts:159,195`) e2e가 이 경로를 못 탄다.
- **구체적 수정**: 집계에서 plan 제외 — `FROM tasks t JOIN report_sections s ON s.id=t.section_id WHERE s.kind <> 'plan' GROUP BY t.report_id`. 또는 plan task를 실행 섹션으로 승격/이월해 중복 row 자체를 제거.

### C8. SESSION_SECRET 운영 기본값 폴백 (High)
- **파일**: `src/lib/env.ts:12`, `src/lib/auth/session.ts:19,33,47`
- **왜 위험**: `sessionSecret: process.env.SESSION_SECRET ?? "dev-change-me-please"`(env.ts:12)로, 운영에서도 미설정을 막는 검증이 없다(`DATABASE_URL`만 `req()`로 강제). 이 시크릿이 쿠키 서명 HMAC 키이므로(crypto.ts:11-18, session.ts:19 `signValue`), 공개 기본값이면 공격자가 임의 토큰을 서명·위조해 `verifySignedValue`를 통과시킬 수 있다. 위조 토큰이 `sessions` 테이블에 존재해야 해 즉시 탈취는 아니지만 서명층 방어가 무력화된다.
- **구체적 수정**: `isProd && (!process.env.SESSION_SECRET || 약한값/길이<32)`이면 모듈 로드 시 `throw`로 부팅 실패. `req('SESSION_SECRET')`로 운영 필수화 + 최소 엔트로피 검증.

### C9. 미구현 핵심 기능군 — 메일/스케줄러·임시저장·커뮤니케이션 입력·이월/첨부·야간 2단계 (High, 기능 게이트)
실DB·grep으로 확인된 "명세 대비 미구현"이며 실업무 투입의 직접 차단 요인이다.
- **메일/스케줄러/리마인더 전무**: `.send(`가 코드 전체에서 단 한 번도 호출되지 않음(grep 0건), `/api/cron|tick` 라우트 부재, `notifications` insert 없음, reject 시 `reject_notice` 미발송. (`src/lib/mail/index.ts`, `src/app/api/**`) → 진입 링크·리마인더·반려 안내가 전혀 안 나가 일일보고 운영 동력이 빠짐.
- **임시저장(Draft) 부재**: '임시저장' 버튼·`POST /api/reports/:id/save` 라우트 없음. `nightReason`/`dailyComment`는 advance(마감/제출) 시점에만 전송 → 이탈·새로고침 시 입력 소실. (`src/components/report/ReportEditor.tsx`)
- **커뮤니케이션 입력 UI/API 부재**: `view.comms`를 읽기전용 렌더만 함. 추가 폼·`comm_none` 체크·`POST /api/reports/:id/communications` 없음 → 검수 핵심 항목이 시드로만 채워짐.
- **이월·반복·첨부 미구현**: '어제 미완료 불러오기'/'반복 업무' 버튼, `carryover` API, 업무 첨부파일·URL 입력란 없음(`task_attachments`/`carried_from_task_id` 스키마는 존재하나 미사용).
- **야간 2단계 붕괴**: `nightClose`에서 버튼 라벨은 '야간 계획 저장'(report.ts:117)인데 `advanceReport`는 곧장 `lockSection('night')+submit('submitted')`로 검수대기 제출(193-196행). `night_expected_end` 입력 UI가 없어 항상 null. 1차 계획저장/2차 최종제출 분리가 안 됨.
- **구체적 수정**: 위 각각에 대해 save/communications/carryover/attachments 라우트와 폼 추가, cron tick(보호 헤더)+멱등 발송, 야간 1차(예상종료만 저장, status 유지)/2차(제출) 분기 추가. (상세는 원 이슈 suggestedFix 참고)

---

## 3) Medium / Low 묶음 (미반증, 코드 확인)

- **[M] Number(id) 미검증 → NaN 500**: 모든 `[id]` 라우트가 `Number(id)`만 수행(예 approve/route.ts:9), 비정수면 `'NaN'::bigint` 캐스팅 에러로 처리되지 않은 500·내부 타입 노출. 공통 `parseId` 헬퍼로 `Number.isInteger && >0` 가드.
- **[M] 검수대기 중 unlocked 섹션 편집 가능**: 변이 함수가 보고서 status를 보지 않아(`report-mutations.ts:50-123`), 특히 vacation 제출 경로(섹션 잠금 없음, 207-213행)에서 검수대기인데 섹션이 풀려 있어 검수 중 작성자가 데이터 변조 가능. 변이 진입 시 `r.status IN ('작성중','반려','미작성')` 확인.
- **[M] advance의 공통필드가 view 모드에도 무조건 저장**: `advanceReport`가 switch 이전에 `dailyComment`/`noCommunication`를 무조건 UPDATE(146-155행)해, 이미 검수대기/승인된 읽기전용 보고서에 위조 요청으로 코멘트·플래그를 덮어쓸 수 있다. `mode==='view'`면 조기 반환하거나 편집가능 모드일 때만 저장.
- **[M] 야간 분기 `nightExpectedEnd` 미검증**: advance route가 `nightBranch==='yes' && !nightReason`만 검사(16행), 예상종료는 검증/요구 안 함 → 핵심 필드 누락 제출. 라우트에서 필수화.
- **[M] login_code `char(4)` 블랭크 패딩**: 4자 미만 코드는 공백 패딩되는데 로그인 입력은 정확히 4자(`safeEqual` 길이 불일치=false)라, admin이 짧은 코드 발급 시 해당 사용자 영구 로그인 불가(가용성). `varchar(4)` + `CHECK (~ '^[0-9]{4}$')` + createUser 형식 검증.
- **[M] reject target 분기 부분 검증·'편집불가 반려' 양산**: 지목 시간대에 locked 섹션이 0개여도 status만 '반려'로 전이 가능 → 직원이 고칠 섹션 없는 반려. reject route에서 해당 target의 locked 섹션 존재를 교차검증.
- **[L] 사용자 열거 타이밍 노출**: `verifyOtp`가 미존재 시 `safeEqual` 생략(service.ts:29-30)해 응답시간 차이로 loginId 존재 누출. 더미 코드로 비교해 시간 균일화.
- **[L] 스키마 도메인 CHECK/교차 FK 전무**: `tasks`의 `section_id↔report_id` 일치 미보장, `is_vacation`/`night_has`/attachment 부분제약 없음(`0001_init.sql`). 복합 FK·CHECK 제약 추가.

---

## 4) "즉시 실사용" 관점 권고

실제 업무 투입 전 반드시 막아야 할 **배포 게이트(순서대로)**:

1. **인증 교체(C1) + 레이트리밋**: 고정 `'1234'`를 그대로 둔 채로는 운영 불가. 최소한 운영에서 고정코드 경로를 차단하고 계정별 난수 OTP·해시저장·만료·시도제한을 도입. `SESSION_SECRET`(C8)을 운영 필수화하여 부팅 게이트로 강제.
2. **검수 무결성 가드(C2+C4)**: 모든 승인/반려에 `FOR UPDATE` + `status='검수대기'` 전제조건과 자기검수 차단을 한 번에 넣는다. 이게 없으면 검수 데이터를 신뢰할 수 없어 일일검수 제품 자체가 성립하지 않는다.
3. **서버측 상태/소유 일관성(C3·C6·C5 + Medium의 status 가드)**: 변이·전이가 클라이언트 UI에만 의존하지 않도록, advance/addTask/closeTask/updateTask에 보고서 status 가드를 일괄 추가. date 검증과 GET 쓰기 부작용 제거.
4. **집계 정확성(C7)**: 매니저 현황·완결율이 plan 중복으로 왜곡되면 "정확" 목표에 직접 위배 — plan 제외 또는 이월 도입.
5. **운영 기능 연결(C9)**: 메일/스케줄러·임시저장·커뮤니케이션 입력이 없으면 "일일보고 운영"이 돌지 않는다. 적어도 임시저장과 메일 발송 파이프라인은 1차 출시 필수.

**한 줄 결론**: 현재 상태로는 실업무 투입 불가. 인증·검수 무결성·서버측 상태가드 세 축을 먼저 고치고, 그다음 집계 정확성과 미구현 운영 기능을 채워야 한다.

---

## 5) 추가 권장 테스트 (현재 36개가 못 잡는 경로)

- **IDOR/forbidden(API 레벨)**: 직원이 타인 `reportId`/`taskId`로 `/advance`·`/tasks`·`/tasks/:id` 호출 → 403. group_leader가 타 그룹 보고서에 approve/reject → 403. (login 헬퍼로 세션 쿠키 후 `page.request.post` 직접 호출)
- **검수 상태가드**: 이미 '승인'된 보고서 재approve → 409/400, '반려' 보고서 approve → 400, '작성중' 보고서 approve → 거부.
- **자기검수 차단**: group_leader가 자기 검수대기 보고서 approve/reject → 403, 본인 보고서가 검수 큐에 노출되지 않음.
- **LOCKED_SECTION 우회**: locked=true 섹션에 addTask/closeTask/updateTask → `LOCKED_SECTION`/400. 검수대기 보고서 task close API 직접 POST → 400.
- **vacation 위조**: plan/morning 마감된 '작성중' 보고서에 `{vacationType}`만 보내 advance → 거부(섹션 잔존 모순 방지).
- **date 검증**: `/report/2026-13-40`·`/report/hello` → 500 아님(notFound/redirect), 미래 날짜 GET이 행을 만들지 않음.
- **집계 정확성(단위)**: plan task 포함 보고서의 `computeCompletion`/list 집계가 plan을 분모에서 제외하는지.
- **야간 분기 e2e**: afternoonClose에서 야간 'yes'(사유 누락→400 / 입력→night 생성) → nightClose 최종 제출 전체 사이클.
- **login 경계**: 빈/3자리/5자리/공백 otp → 400. N회 실패 후 잠금/레이트리밋 발동.
- **동시성(통합)**: 같은 보고서 동시 advance, 같은 task 동시 close, admin+leader 동시 approve/reject — 이중 이벤트·이중 전이가 없는지(Promise 동시 실행). 현재 `playwright.config`는 `workers:1, fullyParallel:false`라 구조적으로 동시성을 못 만든다 → 별도 통합 테스트 필요.

---

### 거짓양성/주의로 분리한 항목
- **"vacation이 검수대기/승인 보고서에도 적용된다"** 류 주장은 부분 거짓: `computeWriteMode`는 검수대기/승인/제출완료/재제출에 대해 vacation 분기보다 먼저 `'view'`를 반환하므로(`mode.ts:15-17`), vacation 강제는 **편집가능 상태(미작성/작성중)에서만** 성립한다. C3는 이 범위(작성중 + 마감섹션 잔존)에서 유효하다.
- **"advance 이중 제출 race"**: `advanceReport`는 `loadState`에서 `FOR UPDATE`로 행을 잠그므로(`report-mutations.ts:29`) 같은 보고서의 advance끼리는 직렬화된다. 반면 **검수 라우트(C2)는 잠금이 없어** race가 실재한다 — 동시성 리스크는 검수 경로에 집중.