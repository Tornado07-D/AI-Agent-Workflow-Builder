# AI Agent Workflow Builder

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript&logoColor=white)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14-black?logo=next.js&logoColor=white)](#)
[![Nhost](https://img.shields.io/badge/Nhost-BaaS-orange)](#)
[![Hasura](https://img.shields.io/badge/Hasura-GraphQL-1EB4D4?logo=hasura&logoColor=white)](#)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14+-316192?logo=postgresql&logoColor=white)](#)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](#)

A full-stack mini-n8n for building and executing multi-step AI workflows with multi-tenant isolation, role-based authorization, approval gates, and real-time execution streaming.

[Live Demo](#) · [Video Walkthrough](#) · [Architecture Details](ARCHITECTURE.md)

## Final Task — End-to-End Demonstration

The implementation is centered around the final evaluation scenario and demonstrates the required security, execution, and real-time behavior end to end.

### Live Demonstration

**Hosted App:** [https://ai-agent-workflow-builder-rust-ten.vercel.app/](https://ai-agent-workflow-builder-rust-ten.vercel.app/)  
**Walkthrough:** [YOUR VIDEO URL]  

The walkthrough demonstrates:
- Org A creating and executing a workflow
- LLM → HTTP → conditional execution
- Approval gate pausing execution
- Real-time subscription updates without refresh
- Authorized approval and execution resumption
- Webhook-triggered execution
- Org B attempting to access Org A resources and being denied

### Execution Mapping
1. **Org A owner creates the workflow.**
2. **Workflow starts manually** through GraphQL.
3. **LLM step executes** against an LLM API (stubbed with artificial delay as permitted).
4. **HTTP step calls an external API** (`httpbin.org`).
5. **Conditional branch evaluates** the LLM output.
6. **Approval gate pauses execution.**
7. **GraphQL subscription streams** the paused state to the UI live without refreshing.
8. **An authorized Org A user approves** the step via the UI.
9. **Execution resumes** from persisted PostgreSQL state.
10. **The same workflow can also be triggered through a webhook.**
11. **Cross-Tenant Isolation:** An Org B user cannot query, trigger, or approve Org A resources, including when directly supplying an Org A workflow ID (enforced via DB-level RLS).

---

## Assignment Checklist

- ☑️ **Multi-tenant architecture** (Isolated Postgres Organizations)
- ☑️ **2-Layer Permissions** (DB Row-Level Security + Execution Action Checks)
- ☑️ **Live Subscriptions** (GraphQL real-time status UI)
- ☑️ **Stateless Pause/Resume** (Execution memory yielded during Approval Gates)
- ☑️ **Manual & Webhook Triggers** (Dual initiation flows)
- ☑️ **Retry & Quota Limits** (Fault tolerance and usage ceilings built-in)
- ☑️ **Schema Design Write-up** (Detailed below)

---

## Key Engineering Highlights

### 1. Schema Design
The schema strictly separates organization membership, workflow definitions, and execution state. The `organizations` table owns workflows, while `org_members` maps users to organizations and roles. Each execution creates a `workflow_run` with one `step_run` per step, allowing individual status, input/output, errors, retry attempts, and approval metadata to be persisted independently. This separation is what allows execution to pause and resume without retaining server-side process state.

### 2. Multi-Tenant Isolation
PostgreSQL Row-Level Security scopes all organization-owned data through the `org_members` table. A user in Org B is mathematically prevented from querying Org A's workflows.

### 3. Two-Layer Authorization

**Layer 1 — Data Access**  
Hasura/PostgreSQL RLS prevents cross-organization reads and writes.

**Layer 2 — Execution Authorization**  
Serverless Action handlers independently verify organization membership and role before sensitive execution operations (e.g., verifying if a user is an `owner` or `editor` before resuming a paused workflow).

### 4. Stateless Pause / Resume
The serverless execution does not keep an in-memory process alive while waiting for approval. Execution state is persisted to PostgreSQL, allowing the function to gracefully terminate and resume later from the exact persisted state.

### 5. Fault Tolerance
External `llm_call` and `http_request` steps use retry handling for transient failures. Failed steps persist their error state and attempt count without corrupting the overall workflow state.

### 6. Organization Quotas
Each organization maintains usage limits for the current period. Workflow execution verifies available quota before starting and updates usage after successful execution.

---

## Tech Stack
- **Next.js 14** (App Router & React 19)
- **Nhost** (BaaS platform)
- **Hasura GraphQL Engine**
- **PostgreSQL 14**
- **Tailwind CSS v4**
- **Node.js Serverless Functions**

## Features
- **Visual Workflow Builder**: Add, edit, and drag-and-drop steps to create complex AI chains.
- **Granular RBAC**: Owners, Editors, and Viewers have strictly enforced boundaries.
- **Approval Gates**: Workflows can pause mid-execution, safely yielding serverless memory, and resume upon authorization.
- **Live Execution Tracking**: Step-by-step progress streams directly to the frontend via WebSockets.
- **External Webhooks**: Trigger workflows from external systems with secure tokens.

## Architecture

```mermaid
flowchart TD
    Client(["Next.js Frontend"]) -->|GraphQL Mutations/Queries| Hasura["Hasura GraphQL Engine"]
    Client -.->|Live WebSockets| Hasura
    Hasura <-->|Row Level Security| DB[(PostgreSQL)]
    Hasura -->|Webhook Event| Engine["Node.js Execution Engine"]
    Engine <-->|Serialize/Hydrate State| DB
    Engine <-->|External Fetch| APIs["LLMs / 3rd Party APIs"]
```

## Folder Structure

```text
AI-Agent-Workflow-Builder/
├── README.md
├── ARCHITECTURE.md
├── seed.ts
├── frontend/                 # Next.js Application
│   ├── src/app/              # Routes, Layouts, Global CSS
│   ├── src/components/       # UI Components (WorkflowBuilder)
│   └── src/lib/              # Nhost Client setup
└── nhost/                    # Backend Configuration
    ├── metadata/             # Hasura Schema, Permissions, Actions
    ├── migrations/           # PostgreSQL Migrations
    └── functions/            # Node.js Serverless Execution Engine
```

## Installation

1. [Docker Desktop](https://www.docker.com/products/docker-desktop) and [Nhost CLI](https://docs.nhost.io/cli) are required.
2. Clone this repository and navigate to the directory:
```bash
git clone https://github.com/Tornado07-D/AI-Agent-Workflow-Builder.git
cd AI-Agent-Workflow-Builder
```

3. Start the Nhost backend services:
```bash
nhost up
```

4. Seed the database with demo users, orgs, and workflows:
```bash
npm install node-fetch @nhost/nhost-js
npx tsx seed.ts
```

5. Install and start the Next.js frontend:
```bash
cd frontend
npm install --legacy-peer-deps
npm run dev
```

## Triggering via Webhook

You can trigger a workflow programmatically via the Hasura Action endpoint:

```bash
curl -X POST http://localhost:1337/v1/functions/webhookTrigger \
  -H "Content-Type: application/json" \
  -d '{"workflow_id": "YOUR_WORKFLOW_ID", "token": "secret-token-123"}'
```
