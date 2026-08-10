# Final Task: Video Demo Script

Follow this step-by-step script for your video recording to perfectly demonstrate all 6 requirements of the Final Task.

### 1. Show the Organizations Exist
1. Log in to the application as **Owner A** (`ownerA@orga.com` / `password123`).
2. Show that you are logged into **Org A** (using the dropdown at the top right).

### 2. Build the Workflow (Live)
1. In the left panel, click the blue **+ New** button next to Workflows.
2. Name it "Final Demo Workflow".
3. Add a **Trigger** by clicking **+ webhook**. Leave the config as `{}`.
4. Add the following **3 Steps** by clicking the buttons at the bottom:
   - **+ llm_call**: Paste this exactly:
     ```json
     {
       "prompt": "Evaluate this resume: Lead Astronaut with 20 years experience. Return ONLY a valid JSON object with a single key 'score' set to 10."
     }
     ```
   - **+ conditional_branch**: Paste this exactly:
     ```json
     {
       "field": "score",
       "value": 5,
       "operator": ">"
     }
     ```
   - **+ approval_gate**: Leave it as `{}`.
5. Click **Save Changes** in the top right. 

### 3. Start the Workflow Manually & Show Live Streams
1. Click **Run Now**.
2. Explain to the camera: *"It is now executing the LLM call and streaming the status directly from the database using GraphQL subscriptions."*
3. Wait a few seconds. The screen will live-update to show Step 1 and Step 2 succeeding, and Step 3 will hit the **Paused** state (`awaiting_approval`).

### 4. Prove Only Owners Can Approve
1. Click the **Approve** button on the paused step to resume the engine.
2. Mention: *"Because I am the Owner, I can click approve. If I was logged in as a Viewer, the backend Hasura Action would reject the request."*
3. The run will finish and the status will turn green (**COMPLETED**).

### 5. Trigger via Webhook (No Button Click)
1. Open a terminal or Command Prompt window next to your browser.
2. Run this curl command to hit your deployed webhook endpoint (replace `<YOUR_VERCEL_URL>` with your actual URL, or use localhost if running locally):
   ```bash
   curl -X POST https://<YOUR_VERCEL_URL>/v1/functions/_lib/webhook \
     -H "Content-Type: application/json" \
     -d '{"token": "secret-token-123"}'
   ```
   *(Note: The webhook uses the secret token `secret-token-123` hardcoded in your seed data).*
3. Instantly look back at your browser. The UI will catch the new run streaming in automatically without you touching the mouse!

### 6. The Org B Security Proof (The Mic Drop)
1. Click **Sign out** in the top right.
2. Log back in as **Owner B** (`ownerB@orgb.com` / `password123`).
3. Show the empty dashboard: *"No workflows found."*
4. Explain to the camera: *"Because of Hasura's Row-Level Security, Owner B is completely blocked from Org A's data. Even if Owner B guesses the exact Workflow ID and tries to fire the `triggerWorkflowRun` mutation via API, Hasura will block it at the Postgres query planner level. Complete multi-tenant isolation is achieved."*

**End of Video.** You have proven all 6 constraints flawlessly!
