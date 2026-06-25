-- enum 단독 추가(사용 없음). 1차 계획 제출 시 그룹장에게 보내는 알림 종류.
-- migrate.ts가 파일당 BEGIN/COMMIT으로 감싸므로 같은 트랜잭션에서 새 값을 쓰면 'unsafe use of new value'.
-- 사용은 런타임 코드(notify/templates, advance 라우트)에서만.

ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'plan_review_request';
