-- 자동제출 이벤트 종류 + 정책변경 알림 종류. enum ADD VALUE 전용 파일(같은 트랜잭션에서 '사용'하지 않음).
-- 사용처(report-mutations.autoSubmitReport, notify.notifyTimePolicyChanged)는 다음 배포/별 트랜잭션에서 실행됨.
ALTER TYPE review_event_kind ADD VALUE IF NOT EXISTS 'auto_submitted';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'time_policy_changed';
