# Final Assignment Demo Script

Follow this path to demonstrate all key architecture requirements perfectly.

### 1. Preparation
- Ensure `nhost up` is running.
- Run `npx ts-node seed.ts` to bootstrap the data. Keep the terminal output visible (it prints the Workflow ID for the webhook test).

### 2. Builder & Execution (The Happy Path)
1. Open `http://localhost:3000`. Login as `ownerA@orga.com` (password: `password123`).
2. The UI will show the "Onboarding Approval Flow" with the quota bar underneath.
3. Click **Run Now**. 
4. Watch the "Live Execution" panel. You will see Step 1 (LLM) and Step 2 (Conditional) flash as they process, streaming directly from the GraphQL DB subscription.
5. The execution pauses on Step 3 (Approval Gate). 

### 3. Pause / Resume Durability
1. Stop the local Nhost functions server to simulate a massive crash or a cold-start timeline. (Or just confidently state: "The lambda is completely dead right now. State is in Postgres.").
2. Click **Approve**. 
3. The engine picks back up cleanly, reads the LLM output from the DB, and executes the final HTTP Request step.

### 4. Concurrency Defense
1. Rapidly double-click "Run Now" (or explain the code). Show in `triggerWorkflowRun.ts` the atomic `UPDATE ... RETURNING id`. Explain how the second concurrent click receives 0 rows back and halts, protecting the quota.

### 5. Webhook Trigger
1. Copy the Workflow ID from the seed script terminal.
2. In a separate terminal, run:
   ```bash
   curl -X POST http://localhost:1337/v1/functions/webhookTrigger \
     -H "Content-Type: application/json" \
     -d '{"workflow_id": "<ID>", "token": "secret-token-123"}'
   ```
3. Look back at the frontend UI. The subscription immediately catches the new run and streams its progress live!

### 6. The Isolation Proof (The Mic Drop)
1. Sign out. Sign in as `ownerB@orgb.com`.
2. Notice the dashboard is empty.
3. Open the Hasura GraphiQL console (or your network tab) and fire this exact query:
   ```graphql
   query {
     workflows(where: { id: { _eq: "<ORG_A_WORKFLOW_ID>" } }) {
       id
       name
     }
   }
   ```
4. The result is `[]`. No permission errors, just an empty array. The Hasura Layer-1 RLS applies the membership filter at the Postgres query planner level. Org A's data doesn't exist to Org B.
