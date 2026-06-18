-- 도메인 무결성 강화 (CHECK + 교차 FK)

-- 소요시간 음수 금지
ALTER TABLE tasks ADD CONSTRAINT tasks_planned_nonneg
  CHECK (planned_duration_min IS NULL OR planned_duration_min >= 0);
ALTER TABLE tasks ADD CONSTRAINT tasks_actual_nonneg
  CHECK (actual_duration_min IS NULL OR actual_duration_min >= 0);

-- 첨부 종류별 필수값 (file→storage_path, url→url)
ALTER TABLE task_attachments ADD CONSTRAINT task_attachments_kind_chk
  CHECK ((kind = 'file' AND storage_path IS NOT NULL)
      OR (kind = 'url'  AND url IS NOT NULL));

-- task.section_id 가 가리키는 섹션이 task.report_id 와 동일한 보고서인지 보장 (교차 FK)
ALTER TABLE report_sections ADD CONSTRAINT report_sections_id_report_uniq UNIQUE (id, report_id);
ALTER TABLE tasks ADD CONSTRAINT tasks_section_report_fk
  FOREIGN KEY (section_id, report_id) REFERENCES report_sections(id, report_id) ON DELETE CASCADE;

-- 커뮤니케이션 필수 텍스트
ALTER TABLE communications ADD CONSTRAINT comm_counterpart_chk CHECK (length(trim(counterpart)) > 0);
ALTER TABLE communications ADD CONSTRAINT comm_summary_chk CHECK (length(trim(summary)) > 0);
