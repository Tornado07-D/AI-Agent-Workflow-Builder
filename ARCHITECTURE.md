# Architecture & Implementation Write-up

## 1. Schema Reasoning & Data Model

The database schema is strictly designed around a multi-tenant SaaS model, where the `organizations` table serves as the root of all data ownership. 

- **Tenant Isolation**: Every workflow, run, and member maps back to a single `org_id`. This guarantees data locality and prevents cross-contamination.
- **Workflow Definitions vs. Executions**: The schema strongly decouples the *definition* of a workflow (`workflow_steps`, `workflow_triggers`) from the *execution* of a workflow (`workflow_runs`, `step_runs`). This allows workflows to be edited without corrupting the historical record of past runs.
- **JSONB for Flexibility**: Step configurations (e.g., HTTP URLs, LLM prompts) are stored as JSONB. This allows the system to easily introduce new step types without requiring schema migrations for every new configuration field.
- **Computed Fields**: Aggregations like `average_run_duration` and `quota_calls_used` are handled natively by Postgres SQL functions exposed via Hasura computed fields. This pushes heavy aggregation logic down to the database layer, eliminating N+1 queries in the frontend.

## 2. Enforcement of the Two Permission Layers

A core requirement was to enforce permissions at two distinct layers to prevent both data leakage and unauthorized execution.

### Layer 1: Data Access (Hasura Row-Level Security)
This layer guarantees that users can only ever *read* or *write* data that belongs to their organization.
- **Mechanism**: Hasura session variables (`x-hasura-user-id`) are automatically injected by Nhost Auth.
- **Enforcement**: Every table (e.g., `workflows`, `workflow_runs`) has a Hasura permission rule that checks if the caller's `user_id` exists in the `org_members` table for that specific `org_id`. 
- **Result**: If an Org B user guesses the exact UUID of an Org A workflow, Hasura will return an empty array. The backend functions will never even receive the request. This isolation is airtight and enforced at the Postgres level.

### Layer 2: Business Logic & Execution Gating (Action Handlers)
This layer guarantees that even if a user can *see* a workflow, they cannot perform unauthorized actions on it (e.g., a `viewer` triggering a run, or an `editor` approving a critical gate).
- **Mechanism**: Hasura Actions (`triggerWorkflowRun`, `approveStep`) proxy GraphQL mutations to secure serverless functions.
- **Enforcement**: Inside the Node.js action handler, the code explicitly queries the `org_members` table using an Admin Secret to verify the exact role of the caller for that specific workflow.
- **Result**: If a `viewer` attempts to manually call the `triggerWorkflowRun` GraphQL mutation, the Hasura Action succeeds in reaching the function, but the function rejects it with a `403 Forbidden` error before creating a run or deducting quota.

## 3. Implementation of the Approval-Gate (Pause/Resume)

The most complex requirement was ensuring the system does not hold state in serverless memory during long-running approvals.

- **The Database as the Source of Truth**: When the execution engine reaches an `approval_gate` step, it updates the `step_run` status to `awaiting_approval` and the `workflow_run` status to `paused`. **The Node.js function then intentionally terminates.** No Node.js thread or serverless memory is left hanging.
- **Resumption via Mutation**: When an authorized user clicks "Approve" in the UI, they trigger the `approveStep` Hasura Action.
- **Cold-Start Resume**: The `approveStep` function verifies the user's role, marks the step as `succeeded`, records the `approved_by` timestamp, and then literally calls the `runEngine(workflow_run_id)` function again. 
- **Stateless Re-entry**: The engine boots up, queries Postgres to find the exact state of the workflow (noting that steps 1-3 are `succeeded`), and immediately resumes execution at step 4. This architecture guarantees the workflow survives server crashes, cold starts, and approvals that take days to complete.
