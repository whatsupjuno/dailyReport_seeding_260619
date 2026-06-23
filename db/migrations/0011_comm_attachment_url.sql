-- 커뮤니케이션 첨부에 URL(링크) 지원 추가. url이 있으면 link 첨부, 없으면 file 첨부로 해석.
-- (디자인 v23: 커뮤니케이션 기록 추가 폼 하단 "첨부 · 링크 (선택)" → 파일 첨부 / URL 추가)
ALTER TABLE communication_attachments ADD COLUMN url text;
