-- Durable execution safety added after the initial schema was deployed.

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_members_user_org
  ON org_members (user_id, org_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_step_runs_run_step
  ON step_runs (workflow_run_id, workflow_step_id);

-- A rapid double-click by the same signed-in user returns the existing active
-- run. Webhook runs have a NULL triggered_by and may still run independently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_manual_run_per_user
  ON workflow_runs (workflow_id, triggered_by)
  WHERE triggered_by IS NOT NULL
    AND status IN ('pending', 'running', 'paused');

CREATE OR REPLACE FUNCTION reject_quota_overage()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quota_calls_used > NEW.quota_calls_allowed THEN
    RAISE EXCEPTION 'Quota exhausted for organization %', NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_reject_quota_overage ON organizations;
CREATE TRIGGER tr_reject_quota_overage
BEFORE UPDATE OF quota_calls_used, quota_calls_allowed ON organizations
FOR EACH ROW EXECUTE FUNCTION reject_quota_overage();

CREATE OR REPLACE FUNCTION set_record_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_workflows_updated_at ON workflows;
CREATE TRIGGER tr_workflows_updated_at
BEFORE UPDATE ON workflows
FOR EACH ROW EXECUTE FUNCTION set_record_updated_at();

DROP TRIGGER IF EXISTS tr_step_runs_updated_at ON step_runs;
CREATE TRIGGER tr_step_runs_updated_at
BEFORE UPDATE ON step_runs
FOR EACH ROW EXECUTE FUNCTION set_record_updated_at();
