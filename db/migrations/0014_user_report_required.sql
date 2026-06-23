-- 보고서 작성 대상 여부. false면 작성요청(plan_invite)·미제출 독촉(submit_nag) 등 보고 안내 메일에서 제외.
ALTER TABLE users ADD COLUMN IF NOT EXISTS report_required boolean NOT NULL DEFAULT true;
