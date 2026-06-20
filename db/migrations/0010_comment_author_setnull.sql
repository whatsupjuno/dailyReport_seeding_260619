-- #1 댓글 작성자 하드삭제 방어: 사용자 삭제 시 그가 '타 보고서에 남긴 댓글'까지 연쇄삭제되던 문제.
-- author_user_id를 NULL 허용 + ON DELETE SET NULL 로 전환(댓글 본문/이력 보존). 소프트삭제(active=false) 권장은 운영 정책.
ALTER TABLE task_comments ALTER COLUMN author_user_id DROP NOT NULL;
ALTER TABLE task_comments DROP CONSTRAINT IF EXISTS task_comments_author_user_id_fkey;
ALTER TABLE task_comments ADD CONSTRAINT task_comments_author_user_id_fkey
  FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL;
