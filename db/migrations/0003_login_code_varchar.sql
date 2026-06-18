-- char(4) 공백 패딩 이슈 방지: 가변 길이로 전환 (향후 코드 길이 변경 대비)
ALTER TABLE users ALTER COLUMN login_code TYPE varchar(8);
