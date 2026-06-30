-- 0021: 댓글 고도화(v5.0.15) — 수정(edited) · soft-delete(deleted/deleted_at) · @멘션(mentions).
-- soft-delete는 비파괴적: 행/대댓글을 보존하고 deleted=true + deleted_at만 세팅(묘비 표시).
-- mentions = 본문에서 해석한 멘션 대상 사용자 id 배열(알림 연동 메타). 빈 배열 기본.
ALTER TABLE task_comments
  ADD COLUMN edited     boolean     NOT NULL DEFAULT false,
  ADD COLUMN deleted    boolean     NOT NULL DEFAULT false,
  ADD COLUMN deleted_at timestamptz,
  ADD COLUMN mentions   bigint[]    NOT NULL DEFAULT '{}'::bigint[];

-- 정합성: deleted일 때만 deleted_at 존재(soft-delete 외 잔여값 방지).
ALTER TABLE task_comments ADD CONSTRAINT task_comments_deleted_at_chk
  CHECK ((deleted AND deleted_at IS NOT NULL) OR (NOT deleted AND deleted_at IS NULL));
