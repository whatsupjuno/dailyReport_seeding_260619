-- 프로젝트 마스터(관리 화면에서 등록). 작성 화면의 '프로젝트' 드롭다운 제안 소스.
-- tasks.project(자유 텍스트)는 그대로 유지·병행한다 — 마스터는 제안일 뿐 강제 아님(B2 결정).
-- owner_user_id는 users FK(이름 문자열 아님). 표시는 users 조인으로 도출(B1 결정).

CREATE TYPE project_status AS ENUM ('진행중','보류','완료','보관');

CREATE TABLE projects (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL,                 -- 프로젝트명(필수)
  cust_name     text,                          -- 고객명(앱 계층에서 필수 검증)
  cust_contact  text,                          -- 고객담당자(선택)
  owner_user_id bigint REFERENCES users(id) ON DELETE SET NULL,  -- 담당자(앱 계층에서 필수). 사용자 삭제 시 NULL.
  status        project_status NOT NULL DEFAULT '진행중',
  note          text,                          -- 비고(선택)
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_owner ON projects(owner_user_id);
