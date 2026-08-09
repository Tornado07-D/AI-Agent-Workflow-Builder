-- Phase 1 Data Model (Schema & Migrations)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enums
CREATE TYPE org_role AS ENUM ('owner', 'editor', 'viewer');
CREATE TYPE step_type AS ENUM ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
CREATE TYPE trigger_type AS ENUM ('manual', 'webhook', 'scheduled', 'database_event');
CREATE TYPE run_status AS ENUM ('pending', 'running', 'paused', 'completed', 'failed');
CREATE TYPE step_status AS ENUM ('pending', 'running', 'succeeded', 'failed', 'awaiting_approval', 'skipped');

-- organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    quota_calls_allowed INT NOT NULL,
    quota_calls_used INT NOT NULL DEFAULT 0,
    quota_period_start DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- org_members
CREATE TABLE org_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role org_role NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_org_members_user_org ON org_members(user_id, org_id);

-- workflows
CREATE TABLE workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflows_org_id ON workflows(org_id);

-- workflow_steps
CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    step_order INT NOT NULL,
    type step_type NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflow_steps_workflow_order ON workflow_steps(workflow_id, step_order);

-- workflow_triggers
CREATE TABLE workflow_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    type trigger_type NOT NULL,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- workflow_runs
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    status run_status NOT NULL DEFAULT 'pending',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    triggered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_workflow_runs_org_id ON workflow_runs(org_id);

-- step_runs
CREATE TABLE step_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_step_id UUID NOT NULL REFERENCES workflow_steps(id) ON DELETE CASCADE,
    status step_status NOT NULL DEFAULT 'pending',
    input JSONB,
    output JSONB,
    error TEXT,
    attempt_count INT NOT NULL DEFAULT 0,
    approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_step_runs_workflow_run_id ON step_runs(workflow_run_id);

-- VIEW: org_usage_this_month
-- Used to track and return org-level usage data for frontend rendering
CREATE OR REPLACE VIEW org_usage_this_month AS
SELECT 
    id AS org_id,
    quota_calls_used,
    quota_calls_allowed,
    quota_period_start
FROM organizations;

-- Computed field: average_run_duration
-- Calculates the duration of completed runs relative to a specific workflow at query time
CREATE OR REPLACE FUNCTION avg_run_duration(workflow_row workflows)
RETURNS TEXT AS $$
  SELECT COALESCE(avg(finished_at - started_at)::text, 'N/A')
  FROM workflow_runs
  WHERE workflow_id = workflow_row.id
    AND status = 'completed'
    AND finished_at IS NOT NULL
    AND started_at IS NOT NULL;
$$ LANGUAGE sql STABLE;

-- Trigger: workflow_steps & triggers creation logic (Decision D)
-- Protect db_write, notify, and webhook/database_event triggers if user is not owner.
CREATE OR REPLACE FUNCTION check_owner_for_sensitive_steps()
RETURNS TRIGGER AS $$
DECLARE
    current_user_id UUID;
    user_role org_role;
    target_org_id UUID;
BEGIN
    -- Read current user from Hasura session variables passed to Postgres
    -- If NULL (e.g. admin action or system), we allow it.
    current_user_id := (current_setting('hasura.user', true)::jsonb ->> 'x-hasura-user-id')::uuid;
    
    IF current_user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- Find the org_id related to this workflow
    SELECT org_id INTO target_org_id FROM workflows WHERE id = NEW.workflow_id;
    
    -- Fetch the user's role in this organization
    SELECT role INTO user_role FROM org_members 
    WHERE user_id = current_user_id AND org_id = target_org_id;

    IF TG_TABLE_NAME = 'workflow_steps' THEN
        IF NEW.type IN ('db_write', 'notify') THEN
            IF user_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Only organization owners can create % steps', NEW.type;
            END IF;
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'workflow_triggers' THEN
        IF NEW.type IN ('webhook', 'database_event') THEN
            IF user_role IS DISTINCT FROM 'owner' THEN
                RAISE EXCEPTION 'Only organization owners can create % triggers', NEW.type;
            END IF;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_check_owner_workflow_steps
BEFORE INSERT OR UPDATE ON workflow_steps
FOR EACH ROW
EXECUTE FUNCTION check_owner_for_sensitive_steps();

CREATE TRIGGER tr_check_owner_workflow_triggers
BEFORE INSERT OR UPDATE ON workflow_triggers
FOR EACH ROW
EXECUTE FUNCTION check_owner_for_sensitive_steps();
