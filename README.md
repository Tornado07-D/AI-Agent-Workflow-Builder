# AI Agent Workflow Builder

A full-stack, mini n8n-style application purpose-built for chaining AI agent steps. Built with Next.js, Nhost, Hasura, PostgreSQL, and GraphQL.

## Overview

This application allows organizations to build and execute multi-step AI workflows. It features a robust execution engine, live WebSocket subscriptions for run status, and a rigid, two-layer permission model enforcing cross-organizational data isolation and role-based execution gating.

## Tech Stack
- **Frontend**: Next.js 14, React 19, Tailwind CSS, Apollo Client (GraphQL), `@dnd-kit` (drag and drop)
- **Backend**: Nhost (Local dev environment)
- **Database**: PostgreSQL
- **API**: Hasura GraphQL Engine
- **Functions**: Serverless Node.js functions (TypeScript)

## Local Setup & Development

### 1. Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop) installed and running
- [Nhost CLI](https://docs.nhost.io/cli) installed
- Node.js (v18+)

### 2. Start the Backend
From the root directory, start the Nhost local environment:
```bash
nhost up
```
*This spins up PostgreSQL, Hasura, Auth, Storage, and the serverless functions via Docker.*

### 3. Setup LLM API Keys
Create an `.env.development` file inside the `nhost/functions/` folder and add your Gemini (or Groq/OpenRouter) API key:
```env
GEMINI_API_KEY=your_api_key_here
```
*(If no API key is provided, the `llm_call` step is configured to stub the response after a short delay).*

### 4. Seed the Database
In a new terminal, run the database seed script to populate organizations, users, and the demo workflow:
```bash
npx tsx seed.ts
```
*Wait for this to complete. It will create `ownerA@orga.com`, `editorA@orga.com`, `viewerA@orga.com`, and `ownerB@orgb.com`, all with the password `password123`.*

### 5. Start the Frontend
In a new terminal, navigate to the frontend directory and start Next.js:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

### 6. Test the Application
Open `http://localhost:3000` in your browser.
Log in using:
- **Email**: `ownerA@orga.com`
- **Password**: `password123`

You will see the pre-built "Onboarding Approval Flow". Click **Run Now** to test the live execution!

## Webhook Trigger Testing
You can manually trigger the workflow via the Hasura Action webhook endpoint without using the UI:
```bash
curl -X POST http://localhost:1337/v1/functions/webhookTrigger \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "YOUR_WORKFLOW_ID", "token": "secret-token-123"}'
```
