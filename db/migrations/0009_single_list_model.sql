-- #4 단일 "오늘 할 일" 목록 + 완료시각 자동분류. 섹션은 표시 전용으로 강등(테이블 존치).
-- 실행 순서: 컬럼추가 → section_id NULL허용 → 백필 → 가드 → CHECK ADD → 인덱스 → 보고서 컬럼

ALTER TABLE tasks ADD COLUMN completed_at timestamptz;        -- 마감 시각(KST 분류 기준). NULL=미마감
ALTER TABLE tasks ADD COLUMN is_night     boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ALTER COLUMN section_id DROP NOT NULL;      -- 신규 task는 NULL. 0004 교차FK(MATCH SIMPLE)는 NULL 면제

-- 레거시 백필: 완결/지연 task의 completed_at 추정.
--   planned_start('HH:MM' 텍스트, 있으면 그 시각) 우선, 없거나 형식 불량이면 섹션 종류 대표시각. 모두 KST.
UPDATE tasks t
   SET completed_at = COALESCE(
         CASE WHEN t.planned_start ~ '^[0-9]{1,2}:[0-9]{2}'
              THEN (r.report_date + t.planned_start::time) AT TIME ZONE 'Asia/Seoul' END,
         (r.report_date + CASE s.kind
             WHEN 'morning' THEN time '11:00' WHEN 'afternoon' THEN time '16:00'
             WHEN 'night' THEN time '20:00' ELSE time '10:00' END) AT TIME ZONE 'Asia/Seoul')
  FROM report_sections s, daily_reports r
 WHERE s.id = t.section_id AND r.id = t.report_id
   AND t.status IN ('완결','지연') AND t.completed_at IS NULL;

UPDATE tasks t SET is_night = true             -- 레거시 night 섹션 task
  FROM report_sections s WHERE s.id = t.section_id AND s.kind = 'night';

-- (가드) 백필 누락(완결/지연인데 completed_at NULL) 0건 확인 후 CHECK
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM tasks WHERE status IN ('완결','지연') AND completed_at IS NULL;
  IF n > 0 THEN RAISE EXCEPTION '완결/지연인데 completed_at NULL % 건 — 백필 점검', n; END IF;
END $$;
ALTER TABLE tasks ADD CONSTRAINT tasks_completed_at_chk
  CHECK ((status IN ('완결','지연')) = (completed_at IS NOT NULL));

CREATE INDEX idx_tasks_completed ON tasks(report_id, completed_at);

ALTER TABLE daily_reports ADD COLUMN model_version    smallint NOT NULL DEFAULT 1; -- 1=레거시 섹션, 2=단일목록
ALTER TABLE daily_reports ADD COLUMN plan_submitted_at timestamptz;                -- D-C2b 1차(계획) 제출 표식
