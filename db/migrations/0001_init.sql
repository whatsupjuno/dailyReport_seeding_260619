-- Seeding 초기 스키마
-- 상태 라벨은 디자인 SM을 계승해 한글 enum 값 사용(직접 매핑), 구조적 enum은 영문.

-- ===== ENUM types =====
CREATE TYPE user_role AS ENUM ('employee', 'group_leader', 'admin');
CREATE TYPE report_status AS ENUM ('미작성','작성중','제출완료','재제출','검수대기','반려','승인','휴가');
CREATE TYPE section_kind AS ENUM ('plan','morning','afternoon','night');
CREATE TYPE section_status AS ENUM ('계획','작성중','마감완료','재작성');
CREATE TYPE task_status AS ENUM ('계획','진행중','완결','지연');
CREATE TYPE attachment_kind AS ENUM ('file','url');
CREATE TYPE comm_type AS ENUM ('통화','메일','회의','카톡','구두');
CREATE TYPE vacation_type AS ENUM ('연차','반차','병가','공가','기타');
CREATE TYPE review_event_kind AS ENUM ('submitted','rejected','resubmitted','approved');
CREATE TYPE reject_target AS ENUM ('전체','오전','오후','야간');
CREATE TYPE notification_kind AS ENUM (
  'plan_invite','morning_close','afternoon_close','night_close','reminder','rejected','approved'
);
CREATE TYPE notification_status AS ENUM ('queued','sent','failed','skipped');

-- ===== groups & users =====
CREATE TABLE groups (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  leader_user_id bigint,                      -- FK 추가는 users 생성 후
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login_id    text NOT NULL UNIQUE,           -- 사번 또는 아이디
  name        text NOT NULL,
  email       text NOT NULL,
  role        user_role NOT NULL DEFAULT 'employee',
  group_id    bigint REFERENCES groups(id) ON DELETE SET NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE groups
  ADD CONSTRAINT groups_leader_fk FOREIGN KEY (leader_user_id) REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX idx_users_group ON users(group_id);

-- ===== auth =====
CREATE TABLE auth_otps (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  otp_hash    text NOT NULL,                  -- 평문 저장 금지
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_otps_user ON auth_otps(user_id, expires_at DESC);

CREATE TABLE sessions (
  token       text PRIMARY KEY,              -- 랜덤 토큰(쿠키엔 서명본 저장)
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- ===== daily reports =====
CREATE TABLE daily_reports (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id         bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_date     date NOT NULL,
  status          report_status NOT NULL DEFAULT '미작성',
  is_vacation     boolean NOT NULL DEFAULT false,
  vacation_type   vacation_type,
  vacation_comment text,
  daily_comment   text,
  night_has       boolean NOT NULL DEFAULT false,
  night_reason    text,
  night_expected_end timestamptz,
  no_communication boolean NOT NULL DEFAULT false,
  submitted_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, report_date)
);
CREATE INDEX idx_reports_date ON daily_reports(report_date);
CREATE INDEX idx_reports_status ON daily_reports(status);

CREATE TABLE report_sections (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id   bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  kind        section_kind NOT NULL,
  status      section_status NOT NULL DEFAULT '작성중',
  locked      boolean NOT NULL DEFAULT false,
  closed_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, kind)
);

-- ===== tasks =====
CREATE TABLE tasks (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id       bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  section_id      bigint NOT NULL REFERENCES report_sections(id) ON DELETE CASCADE,
  project         text,
  title           text NOT NULL,
  planned_start   text,                      -- 'HH:MM' (30분 단위)
  planned_duration_min int,                  -- 예정 소요(분)
  actual_duration_min  int,                  -- 실제 소요(분)
  status          task_status NOT NULL DEFAULT '계획',
  hold_reason     text,                      -- 지연 사유
  sort_order      int NOT NULL DEFAULT 0,
  carried_from_task_id bigint REFERENCES tasks(id) ON DELETE SET NULL,  -- 연속성(이전/이월)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_report ON tasks(report_id);
CREATE INDEX idx_tasks_section ON tasks(section_id);

CREATE TABLE task_attachments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id     bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  kind        attachment_kind NOT NULL,
  file_name   text,                          -- kind=file
  url         text,                          -- kind=url
  storage_path text,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_attachments_task ON task_attachments(task_id);

-- ===== communications =====
CREATE TABLE communications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id   bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  comm_type   comm_type NOT NULL,
  counterpart text NOT NULL,
  occurred_at text,                          -- 'HH:MM'
  summary     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comm_report ON communications(report_id);

CREATE TABLE communication_attachments (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  communication_id bigint NOT NULL REFERENCES communications(id) ON DELETE CASCADE,
  file_name   text,
  storage_path text,
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== review / 검수 이력 타임라인 =====
CREATE TABLE report_events (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id   bigint NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
  kind        review_event_kind NOT NULL,
  actor_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  comment     text,                          -- 반려 시 그룹장 코멘트
  reject_target reject_target,               -- 반려 대상 시간대
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_report ON report_events(report_id, created_at);

-- ===== notifications (email log + 스케줄) =====
CREATE TABLE notifications (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id   bigint REFERENCES daily_reports(id) ON DELETE CASCADE,
  kind        notification_kind NOT NULL,
  channel     text NOT NULL DEFAULT 'email',
  subject     text,
  status      notification_status NOT NULL DEFAULT 'queued',
  provider_id text,
  scheduled_for timestamptz,
  sent_at     timestamptz,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_sched ON notifications(status, scheduled_for);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);

-- ===== qualitative metrics (RESERVED · v1 미개발) =====
CREATE TABLE qualitative_metrics (
  report_id   bigint PRIMARY KEY REFERENCES daily_reports(id) ON DELETE CASCADE,
  efficiency  int,                           -- 효율성 (v1 NULL)
  continuity  int,                           -- 연속성 (v1 NULL)
  relevance   int,                           -- 연관성 (v1 NULL)
  computed_at timestamptz
);
