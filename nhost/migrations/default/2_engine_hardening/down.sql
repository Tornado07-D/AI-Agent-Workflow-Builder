DROP TRIGGER IF EXISTS tr_step_runs_updated_at ON step_runs;
DROP TRIGGER IF EXISTS tr_workflows_updated_at ON workflows;
DROP FUNCTION IF EXISTS set_record_updated_at();

DROP TRIGGER IF EXISTS tr_reject_quota_overage ON organizations;
DROP FUNCTION IF EXISTS reject_quota_overage();

DROP INDEX IF EXISTS uq_active_manual_run_per_user;
DROP INDEX IF EXISTS uq_step_runs_run_step;
DROP INDEX IF EXISTS uq_org_members_user_org;
