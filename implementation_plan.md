# Implementation Plan: Completing Assignment Requirements

We will add the missing 4 requirements to achieve a 100% completion state for the assignment.

## User Review Required

Please review the proposed schema and Hasura additions. These will require minor database migrations and metadata updates.

## Proposed Changes

### 1. Database Migrations (PostgreSQL & Hasura)
We need to add two new tables to support the `db_write` and `notify` steps.
- **`app_data` table**: A generic table to satisfy the `db_write` step requirement ("saves a result into your own tables").
- **`notifications` table**: To satisfy the `notify` step ("implemented as an Event Trigger").

### 2. Event Triggers (Hasura Metadata)
- **Notify Event Trigger**: Triggered on `INSERT` to the `notifications` table. Calls a new serverless function (`eventNotify`).
- **Database Event Trigger**: Triggered on `INSERT` to the `app_data` table. Calls a new serverless function (`eventTrigger`) which auto-starts workflows listening for database events.
- **Scheduled (Cron) Trigger**: A Hasura Cron Trigger that runs every minute and calls a new serverless function (`cronTrigger`) to start scheduled workflows.

### 3. Serverless Functions (`/nhost/functions`)
- **[NEW] `eventNotify.ts`**: Receives the Hasura Event Trigger when a notification is inserted and stubs a Slack/email alert (e.g., via console logging).
- **[NEW] `eventTrigger.ts`**: Receives the Hasura Event Trigger when a row changes and auto-starts relevant workflows.
- **[NEW] `cronTrigger.ts`**: Receives the Hasura Cron Trigger payload and starts scheduled workflows.
- **[MODIFY] `runEngine.ts`**: Add logic to handle `db_write` (inserts to `app_data`) and `notify` (inserts to `notifications`) step types.

### 4. Layer 2 Security Enforcement
- As per the assignment: *"only an owner can add a db_write, a webhook trigger, or a notify step"*. 
- I will add strict validation in the GraphQL backend or UI to ensure only `owner` roles can configure these specific sensitive steps/triggers.

## Verification Plan
1. Start the local Nhost backend to test the migrations and metadata.
2. Manually test adding a `db_write` and `notify` step to a workflow and executing it.
3. Verify the `notifications` event trigger successfully fires `eventNotify.ts`.
4. Push to GitHub, let Nhost cloud deploy it, and confirm 100% assignment completion.
