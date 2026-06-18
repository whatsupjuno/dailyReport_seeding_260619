-- OTP 발급은 추후 구현. 지금은 DB에 저장된 고정 4자리 코드로 로그인.
ALTER TABLE users ADD COLUMN login_code char(4) NOT NULL DEFAULT '1234';
-- auth_otps 테이블은 향후 실 OTP용으로 유지(현재 미사용).
