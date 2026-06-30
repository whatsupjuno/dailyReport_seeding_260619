-- enum 단독 추가(사용 없음). 댓글·대댓글·@멘션 알림 종류 3종(v5.0.15 알림 연동).
-- migrate.ts가 파일당 BEGIN/COMMIT으로 감싸므로, 같은 트랜잭션에서 새 enum 값을 '사용'(INSERT/CHECK/비교/캐스트)하면
-- 'unsafe use of new value' 에러가 난다 → 사용은 런타임 코드(notify.notifyComment / templates.commentEmail,
-- 댓글 POST 경로)에서만, 다음 배포/별 트랜잭션에서 실행된다.
--   comment        = 최상위 댓글(스레드 상대편에게)
--   comment_reply  = 대댓글(스레드 참여자에게)
--   comment_mention= @멘션(언급된 사용자에게)
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'comment';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'comment_reply';
ALTER TYPE notification_kind ADD VALUE IF NOT EXISTS 'comment_mention';
