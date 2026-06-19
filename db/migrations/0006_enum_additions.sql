-- enum 단독 추가 3종. 이 파일은 새 값을 '사용'(INSERT/CHECK/비교/캐스트)하지 않는다.
-- migrate.ts가 파일당 BEGIN/COMMIT으로 감싸므로, 같은 트랜잭션에서 새 enum 값을 쓰면
-- 'unsafe use of new value' 에러가 난다 → 사용은 후속 파일(0007)·런타임 코드에서만.
--   #2 휴직(vacation_type) / C2 계획제출(report_status, 2단계 제출) / H4 메신저(comm_type, 커뮤 6종 정합)

ALTER TYPE vacation_type ADD VALUE IF NOT EXISTS '휴직'   AFTER '공가';
ALTER TYPE report_status ADD VALUE IF NOT EXISTS '계획제출' AFTER '작성중';
ALTER TYPE comm_type     ADD VALUE IF NOT EXISTS '메신저';
