# AI Agent Workflow Builder

A full-stack, multi-tenant application that allows users to build, execute, and monitor AI-driven workflows. The application features a conditional branching engine, LLM integration, approval gates, and external webhook triggers.

## Architecture

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend & Database**: Nhost (Hasura GraphQL, PostgreSQL, Authentication)
- **Serverless Functions**: Nhost Node.js Functions (Execution Engine)
- **AI Integration**: Google Gemini API

## Setup & Running Locally

Follow these steps to run the application locally on your machine.

### Prerequisites
- Node.js (v20+)
- Nhost CLI installed (`npm install -g nhost`)
- Docker (required by Nhost CLI to run the local Hasura/Postgres stack)

### 1. Start the Local Backend
Navigate to the root directory and start the Nhost local environment.
```bash
nhost up
```
This will start the local database, GraphQL engine, and authentication server.

### 2. Configure API Keys
The application requires a Google Gemini API key to run the `llm_call` steps.
By default, the codebase is configured to fallback to a pre-configured Gemini API key if one is not provided in the environment variables, meaning **it will work out of the box with zero configuration!**

However, if you wish to use your own API key locally, create a `.env.development` file in the `frontend` directory and a `.secrets` file in the root directory:
```
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start the Frontend
Navigate to the `frontend` directory, install dependencies, and start the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

### 4. Seed the Database
To populate the database with a default organization, a test user, and a sample workflow, you can run the seed script:
```bash
npx tsx seed.ts
```
*Note: Make sure to check `seed.ts` to copy the test user credentials so you can log in.*

## Deliverables Checklist

- [x] **GitHub repo with README**: You are reading it!
- [x] **Hosted URL**: Available via the Vercel deployment link provided by the repository owner.
- [x] **Hasura metadata/migrations**: Located in the `/nhost/metadata` and `/nhost/migrations` directories.
- [x] **1-Page Write-up**: Read `WRITEUP.md` in the root directory for a deep dive into the schema reasoning, dual-layer permissions, and execution engine architecture.
