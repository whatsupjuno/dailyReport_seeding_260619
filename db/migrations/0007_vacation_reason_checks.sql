-- #2 휴가/휴직/기타 사유: 길이 상한 + 필수유형 빈사유 보정(가역 백업) + 필수 CHECK.
-- 0006 커밋 후 실행이므로 '휴직' 라벨 안전 참조 가능.

-- (가드 1) 길이 초과 사유 사전 차단 — 운영 위반 0건 예상, 있으면 의도적 abort
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM daily_reports WHERE char_length(vacation_comment) > 10000;
  IF n > 0 THEN RAISE EXCEPTION '길이 초과 사유 % 건 — 수동 정리 필요', n; END IF;
END $$;

-- (1) 길이 상한 10,000자 (NULL 허용)
ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_vacation_comment_len
  CHECK (vacation_comment IS NULL OR char_length(vacation_comment) <= 10000);

-- (★가역 백업) 빈 사유 필수유형 행을 placeholder로 덮기 전에 원본을 백업 테이블에 적재.
--   비가역 치환의 복구 경로 확보. 멱등: 이미 적재된 id는 제외.
CREATE TABLE IF NOT EXISTS _vac_backfill_log (
  report_id            bigint PRIMARY KEY,
  old_vacation_comment text,
  vacation_type        text,
  logged_at            timestamptz NOT NULL DEFAULT now()
);
INSERT INTO _vac_backfill_log (report_id, old_vacation_comment, vacation_type)
SELECT id, vacation_comment, vacation_type::text
  FROM daily_reports
 WHERE is_vacation = true
   AND vacation_type IN ('병가','기타')   -- '휴직'은 신규값이라 기존 행 없음
   AND (vacation_comment IS NULL OR char_length(btrim(vacation_comment)) = 0)
ON CONFLICT (report_id) DO NOTHING;

-- (가드 2) 보정 대상 건수 로깅(운영 가시성)
DO $$ DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _vac_backfill_log;
  RAISE NOTICE '빈 사유 필수유형 보정 대상 % 건 (백업 적재 완료)', n;
END $$;

-- (2) 필수 유형(병가·휴직·기타) 빈 사유 보정 후 CHECK.
--     기존 비필수였으므로 빈 사유 휴가 행이 운영에 존재 가능 → 먼저 placeholder 보정(멱등).
UPDATE daily_reports
   SET vacation_comment = '(사유 미기재 — 기존 데이터)'
 WHERE is_vacation = true
   AND vacation_type IN ('병가','기타')   -- '휴직'은 신규값이라 기존 행 없음
   AND (vacation_comment IS NULL OR char_length(btrim(vacation_comment)) = 0);

ALTER TABLE daily_reports ADD CONSTRAINT daily_reports_vacation_reason_required
  CHECK (
    NOT ( is_vacation = true
      AND vacation_type IN ('병가','휴직','기타')
      AND (vacation_comment IS NULL OR char_length(btrim(vacation_comment)) = 0) )
  );
