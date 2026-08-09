import { createNhostClient } from '@nhost/nhost-js';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

// Requires: npm install @nhost/nhost-js node-fetch
// Run: npx ts-node seed.ts

const nhost = createNhostClient({
  subdomain: 'local'
});

const GRAPHQL_URL = 'https://local.graphql.local.nhost.run/v1';
const ADMIN_SECRET = 'nhost-admin-secret';

async function runQuery(query: string, variables: any = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { 'x-hasura-admin-secret': ADMIN_SECRET, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables })
  });
  const data = await res.json();
  if (data.errors) throw new Error(JSON.stringify(data.errors));
  return data.data;
}

async function seed() {
  console.log("Seeding Database...");
  
  // 1. Create Orgs
  const orgRes = await runQuery(`
    mutation CreateOrgs {
      insert_organizations(objects: [
        { name: "Org A", quota_calls_allowed: 1000, quota_period_start: "2026-08-01" },
        { name: "Org B", quota_calls_allowed: 100, quota_period_start: "2026-08-01" }
      ]) { returning { id name } }
    }
  `);
  
  const orgA = orgRes.insert_organizations.returning.find((o:any) => o.name === 'Org A');
  const orgB = orgRes.insert_organizations.returning.find((o:any) => o.name === 'Org B');

  // 2. Create Users
  const userDefs = [
    { email: 'ownerA@orga.com', pw: 'password123', role: 'owner', orgId: orgA.id },
    { email: 'editorA@orga.com', pw: 'password123', role: 'editor', orgId: orgA.id },
    { email: 'viewerA@orga.com', pw: 'password123', role: 'viewer', orgId: orgA.id },
    { email: 'ownerB@orgb.com', pw: 'password123', role: 'owner', orgId: orgB.id },
  ];

  for (const u of userDefs) {
    try {
      await nhost.auth.signUpEmailPassword({ email: u.email, password: u.pw });
    } catch(e: any) {
      console.log("Error signing up", u.email, e.message || e);
    }
    
    const userRes = await runQuery(`query { users(where: {email: {_eq: "${u.email}"}}) { id } }`);
    const userId = userRes.users?.[0]?.id;

    if (!userId) {
       console.log("Could not find user in DB:", u.email);
       continue;
    }
    
    await runQuery(`
      mutation AddMember($user_id: uuid!, $org_id: uuid!, $role: org_role!) {
        insert_org_members_one(object: {user_id: $user_id, org_id: $org_id, role: $role}) { id }
      }
    `, { user_id: userId, org_id: u.orgId, role: u.role });
    console.log(`Created ${u.email} as ${u.role}`);
  }

  // 3. Create demo workflow in Org A
  const ownerAId = await runQuery(`query { org_members(where: {organization: {id: {_eq: "${orgA.id}"}}, role: {_eq: "owner"}}) { user_id } }`).then(res => res.org_members[0].user_id);

  const wfRes = await runQuery(`
    mutation CreateDemoWf($org_id: uuid!, $user_id: uuid!, $steps: [workflow_steps_insert_input!]!, $triggers: [workflow_triggers_insert_input!]!) {
      insert_workflows_one(object: {
        org_id: $org_id,
        name: "Onboarding Approval Flow",
        description: "Evaluates score, gates for approval, then hits external webhook",
        created_by: $user_id,
        steps: { data: $steps },
        triggers: { data: $triggers }
      }) { id }
    }
  `, { 
    org_id: orgA.id, 
    user_id: ownerAId,
    steps: [
      { step_order: 1, type: "llm_call", config: { prompt: "Analyze the candidate profile and return a score out of 10 in JSON format like {\"score\": 8}" } },
      { step_order: 2, type: "conditional_branch", config: { field: "score", operator: ">", value: 5 } },
      { step_order: 3, type: "approval_gate", config: {} },
      { step_order: 4, type: "http_request", config: { url: "https://httpbin.org/post", method: "POST" } }
    ],
    triggers: [
      { type: "webhook", config: { token: "secret-token-123" } }
    ]
  });

  console.log("Created Demo Workflow in Org A with ID:", wfRes.insert_workflows_one.id);
  console.log("\nSeed Complete! Use the above workflow ID for testing the webhook.");
}

seed().catch(console.error);
