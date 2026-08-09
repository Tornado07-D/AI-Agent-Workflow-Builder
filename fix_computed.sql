-- Fix 1: Change avg_run_duration to return TEXT instead of INTERVAL
DROP FUNCTION IF EXISTS avg_run_duration(workflows);
CREATE OR REPLACE FUNCTION avg_run_duration(workflow_row workflows)
RETURNS TEXT AS $$
  SELECT COALESCE(
    avg(finished_at - started_at)::text,
    'N/A'
  )
  FROM workflow_runs
  WHERE workflow_id = workflow_row.id
    AND status = 'completed'
    AND finished_at IS NOT NULL
    AND started_at IS NOT NULL;
$$ LANGUAGE sql STABLE;
