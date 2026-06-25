-- 그룹별 보고서 시간정책. 추가전용.
-- is_ai_group = 마스터 토글: 켜면 09:00 날짜경계 + 24시간 표기 + 매일 + 보고일=윈도우 시작일(파생).
-- write_start/end = 작성창(SOFT, 알림/마감임박 라벨 전용 — 편집 잠금 아님).
-- submit_due = 자동제출 시각. NULL = 자동제출 OFF(Sales '제한없음').
ALTER TABLE groups
  ADD COLUMN is_ai_group boolean NOT NULL DEFAULT false,
  ADD COLUMN write_start time NOT NULL DEFAULT '00:00',
  ADD COLUMN write_end   time NOT NULL DEFAULT '23:59',
  ADD COLUMN submit_due  time NULL;

-- 보고서별 정책 스냅샷(생성 시 고정 → 정책 변경은 '그 다음 보고서부터' 적용).
-- win_snapshotted=false = 0018 이전 기존 행 → 런타임에서 DEFAULT_WINDOW 폴백.
-- win_submit_due NULL의 의미("자동제출 OFF" vs "미스냅샷")는 win_snapshotted로 구분.
ALTER TABLE daily_reports
  ADD COLUMN win_snapshotted boolean NOT NULL DEFAULT false,
  ADD COLUMN win_is_ai       boolean NULL,
  ADD COLUMN win_write_start time NULL,
  ADD COLUMN win_write_end   time NULL,
  ADD COLUMN win_submit_due  time NULL;

-- 시드: 운영 그룹은 name으로 매칭(id는 환경별 상이 — 로컬 seed는 개발팀/마케팅팀). 미매칭은 0행 UPDATE로 무해.
-- 예시 기본값(관리 화면에서 언제든 수정 가능).
UPDATE groups SET is_ai_group=true,  write_start='09:00', write_end='08:59', submit_due='09:00'
  WHERE name='AI Agent';                                   -- 09:00 경계·24h·매일·익일 09:00 자동제출
UPDATE groups SET is_ai_group=false, write_start='08:00', write_end='18:59', submit_due='20:00'
  WHERE name='Sales';                                      -- 평일·08:00~18:59·20:00 자동제출
UPDATE groups SET is_ai_group=false, write_start='11:00', write_end='21:00', submit_due='21:30'
  WHERE name='Product Design';                             -- 평일·11:00~21:00·21:30 자동제출
