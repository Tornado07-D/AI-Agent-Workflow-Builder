# Architecture & Schema Reasoning

## The Single Source of Truth
The hardest technical requirement is ensuring that the run engine survives cold starts. If an execution hits an `approval_gate`, we cannot afford to leave a Node.js process spinning or hold state in a promise chain. 

**Solution**: The `step_runs` table is the sole source of truth. When the engine encounters an `approval_gate`, it executes an atomic `UPDATE` to change the `workflow_runs` status to `paused`, and immediately returns (terminating the lambda). 
When `approveStep` is invoked, it updates the DB status to `succeeded` and restarts the engine on the *exact same* run ID. The engine reads the `step_runs` array, bypasses the succeeded steps by merely hydrating `previousOutput = stepRun.output`, and seamlessly resumes the pending steps. This is mathematically pure and handles crashes inherently.

## Two Distinct Permission Layers

**Layer 1: Hasura Row-Level Security**
Hasura enforces structural tenant isolation at the GraphQL to SQL compilation step. 
By embedding `{ "org": { "members": { "user_id": { "_eq": "X-Hasura-User-Id" } } } }` globally, the application code doesn't have to remember to append `WHERE org_id = ?`. If a user from Org B guesses a workflow ID belonging to Org A, the database itself filters the row out, returning an empty array. A compromised frontend cannot bypass this.

**Layer 2: Business Logic Gating**
Hasura cannot natively differentiate mid-execution runtime states cleanly (e.g., "Allow approval only if the step is awaiting_approval AND the user is an owner of the org tied to the workflow run"). 
We enforce these dynamic rules in our Nhost Functions (for `approveStep`) and via Postgres `BEFORE INSERT/UPDATE` triggers (for restricting non-owners from creating `db_write` or `notify` steps). This ensures that even if a malicious user bypasses the frontend UI and hits the GraphQL API directly, the Postgres trigger will intercept the mutation and throw an error.

## Database Design Choices
- **UUIDs everywhere**: Prevents sequential ID guessing attacks, directly proving our isolation models.
- **Enums**: Hardcoded inside Postgres. No bad data can corrupt the run engine state.
- **JSONB config/output**: Ensures that if we introduce a new step type tomorrow, the schema does not need a migration. The engine simply passes the `output` JSON to the next step's evaluator.
- **Atomic Quota Check**: Done via a Hasura `_inc` mutation during the LLM step execution. Fetching-then-updating creates a race condition on high concurrency. The `_inc` guarantees atomic database locks.
