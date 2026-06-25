-- 그룹별 '작성 요청 메일(plan_invite) 발송 시각'. NULL = 작성 요청 메일 안 보냄.
-- cron이 매 N분 폴링하며 '현재 KST 시각 ≥ invite_at(당일) && 오늘 미발송'인 그룹 구성원에게 발송(plan_invite_tick).
ALTER TABLE groups ADD COLUMN invite_at time NULL;

-- 시드: 비-AI는 작성창 시작 시각에 발송(자연스러운 기본값, 관리에서 수정 가능). AI는 자체 관리라 미발송(NULL).
UPDATE groups SET invite_at = '08:00' WHERE name = 'Sales';
UPDATE groups SET invite_at = '11:00' WHERE name = 'Product Design';
-- AI Agent: invite_at NULL 유지(작성 요청 메일 없음).
