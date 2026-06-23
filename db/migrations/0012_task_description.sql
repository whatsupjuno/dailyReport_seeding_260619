-- 업무 설명(상세) 컬럼. 업무 추가/수정 폼의 '업무 설명' 입력 + '오늘 할 일' 행 표시용.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description text;
