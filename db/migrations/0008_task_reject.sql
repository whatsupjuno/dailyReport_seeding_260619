-- #3 업무 행 단위 반려. 보고서/시간대 반려(report_events)와 공존.
-- (tasks(id,report_id) UNIQUE 는 0005에서 추가됨 — 교차 FK 토대 공유)

ALTER TABLE tasks ADD COLUMN reject_state text;        -- NULL=정상, '반려'=행 반려
ALTER TABLE tasks ADD COLUMN rejected_at  timestamptz;
ALTER TABLE tasks ADD CONSTRAINT tasks_reject_state_chk
  CHECK (reject_state IS NULL OR reject_state = '반려');

CREATE TABLE task_rejections (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  report_id   bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  event_id    bigint REFERENCES report_events(id) ON DELETE SET NULL, -- 부분반려 회신 회차 그룹핑(회신 전 NULL)
  comment     text NOT NULL CHECK (length(trim(comment)) > 0),
  rejected_by bigint REFERENCES users(id) ON DELETE SET NULL,
  rejected_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,                            -- 작성자 재제출/재마감 시 해소
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE task_rejections ADD CONSTRAINT task_rejections_task_report_fk
  FOREIGN KEY (task_id, report_id) REFERENCES tasks(id, report_id);
-- 같은 task 미해소 반려 최대 1건 (부분 유니크; ON CONFLICT 추론용 동일 술어)
CREATE UNIQUE INDEX uq_task_rejection_open ON task_rejections(task_id) WHERE resolved_at IS NULL;
CREATE INDEX idx_task_rejections_report ON task_rejections(report_id) WHERE resolved_at IS NULL;

-- 상태전이 주의(A-1/I): 이 테이블에 insert하는 rejectTask는 daily_reports.status를 바꾸지 않는다
-- (검수대기/계획제출 유지). 검수대기→반려 전이는 회신 함수 rejectReport 1회뿐(event_id 연결).
