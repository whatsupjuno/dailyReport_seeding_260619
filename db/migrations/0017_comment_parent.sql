-- 0017: 댓글 대댓글(1단계 중첩). task_comments 자기참조 FK.
-- 부모 삭제 시 자식도 함께 삭제(CASCADE). 평탄화(1단계)는 애플리케이션(addComment)에서 강제.
ALTER TABLE task_comments ADD COLUMN parent_id bigint REFERENCES task_comments(id) ON DELETE CASCADE;
CREATE INDEX idx_task_comments_parent ON task_comments(parent_id);
