-- enum 단독 추가. 이 파일은 새 값을 '사용'(INSERT/CHECK/비교/캐스트)하지 않는다.
-- migrate.ts가 파일당 BEGIN/COMMIT으로 감싸므로, 같은 트랜잭션에서 새 enum 값을 쓰면
-- 'unsafe use of new value' 에러가 난다 → 사용은 런타임 코드에서만(planRejectReport, sendAndRecord).
--   요청#1 계획 반려(review_event_kind) / 요청#2 이벤트 알림(notification_kind)

ALTER TYPE review_event_kind ADD VALUE IF NOT EXISTS 'plan_rejected';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'review_request';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'resubmit_review';
