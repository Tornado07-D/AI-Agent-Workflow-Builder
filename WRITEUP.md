# AI Agent Workflow Builder Write-up

## Schema Reasoning
Our database schema is highly normalized and designed around multi-tenancy and granular execution tracking.
- **Organizations & Users**: The `organizations`, `users`, and `organization_members` tables form the foundation of our multi-tenant architecture. Every workflow and run belongs to an organization, not an individual user.
- **Workflows**: The `workflows` table stores the core definition (triggers and sequential steps) as JSONB. This allows infinite flexibility in defining step configurations without needing schema migrations.
- **Execution Tracking**: When a workflow runs, a `workflow_runs` record is created. As the engine evaluates the workflow, it spawns `step_runs` records for each individual step. This separation allows us to track the exact state, latency, and output of every single node in the graph, making it possible to pause, resume, and debug specific steps in real-time.

## Two Permission Layers
Security in this application is enforced through a dual-layer approach to ensure both client-side and system-level safety:

1. **Hasura Row-Level Security (Database Layer)**
   Client applications (like the Next.js frontend) communicate directly with the Hasura GraphQL API. Hasura enforces strict Row-Level Security (RLS) policies based on the JWT token. When a user queries workflows, Hasura automatically injects `x-hasura-user-id` and `x-hasura-org-id` session variables. The RLS policies ensure that the user can *only* read and modify data that belongs to the organization they are a member of. 

2. **Serverless Functions (Application Logic Layer)**
   Our Nhost Serverless Functions (like the execution engine) perform system-level tasks and interact with the database using the `HASURA_GRAPHQL_ADMIN_SECRET`, which completely bypasses RLS. To maintain security, these functions manually enforce permissions in the application code. For example, before resuming a paused workflow, the `/approveStep` function verifies the incoming JWT, looks up the user's organization, and verifies that the user is authorized to approve steps for that specific workflow run. Similarly, webhook triggers validate a pre-shared secret token before initiating a run.

## Approval-Gate Pause and Resume
The approval gate is implemented as an asynchronous interruption in the execution loop:

1. **Pause**: When the `runEngine` encounters an `approval_gate` step, it inserts a `step_run` record into the database with its status set to `paused`. The engine then intentionally terminates execution, leaving the `workflow_run` in a `running` state.
2. **Client Polling**: The frontend subscribes to real-time updates. When it sees a `step_run` in the `paused` state, it halts the UI execution stream and renders an "Approve" button.
3. **Resume**: When a human clicks "Approve", the frontend sends an HTTP request to the `/approveStep` serverless function. This function marks the paused `step_run` as `succeeded`. It then acts as a trampoline, making an internal HTTP call back to the main `/triggerWorkflowRun` endpoint. The engine boots back up, queries the database to find the last completed step, and seamlessly resumes execution at the very next step.
