-- #1 업무별 댓글. 작성자/검수자 공통, per-user 읽음 워터마크.

-- (공유) #1·#3가 함께 쓰는 (id, report_id) UNIQUE — 교차FK 토대. tasks.id가 PK라 즉시 통과.
ALTER TABLE tasks ADD CONSTRAINT tasks_id_report_uniq UNIQUE (id, report_id);

CREATE TABLE task_comments (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id        bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  report_id      bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  author_user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  author_role    user_role NOT NULL,
  body           text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE task_comments ADD CONSTRAINT task_comments_body_chk
  CHECK (length(trim(body)) > 0 AND length(body) <= 10000);
ALTER TABLE task_comments ADD CONSTRAINT task_comments_task_report_fk
  FOREIGN KEY (task_id, report_id) REFERENCES tasks(id, report_id) ON DELETE CASCADE;
CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);
CREATE INDEX idx_task_comments_report ON task_comments(report_id);

-- per-user/per-task 읽음 워터마크 (미읽음 판정용)
CREATE TABLE comment_reads (
  user_id      bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id      bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id)
);
