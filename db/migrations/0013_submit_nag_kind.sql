-- 미제출 독촉 알림 종류. (20시 이후·야간업무 없음·미제출 대상, 5분 간격 최대 30회)
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'submit_nag';
