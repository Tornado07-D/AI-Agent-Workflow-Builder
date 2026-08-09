-- Phase 1 Data Model Rollback

DROP TRIGGER IF EXISTS tr_check_owner_workflow_triggers ON workflow_triggers;
DROP TRIGGER IF EXISTS tr_check_owner_workflow_steps ON workflow_steps;
DROP FUNCTION IF EXISTS check_owner_for_sensitive_steps();

DROP FUNCTION IF EXISTS avg_run_duration(workflows);
DROP VIEW IF EXISTS org_usage_this_month;

DROP TABLE IF EXISTS step_runs CASCADE;
DROP TABLE IF EXISTS workflow_runs CASCADE;
DROP TABLE IF EXISTS workflow_triggers CASCADE;
DROP TABLE IF EXISTS workflow_steps CASCADE;
DROP TABLE IF EXISTS workflows CASCADE;
DROP TABLE IF EXISTS org_members CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

DROP TYPE IF EXISTS step_status;
DROP TYPE IF EXISTS run_status;
DROP TYPE IF EXISTS trigger_type;
DROP TYPE IF EXISTS step_type;
DROP TYPE IF EXISTS org_role;
