import { Request, Response } from 'express';
import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';

export default async function handler(req: Request, res: Response) {
  const { input, session_variables } = req.body;
  const workflowId = input.workflow_id;
  const userId = session_variables['x-hasura-user-id'];

  try {
    const wfData = await runQuery(`
      query GetWf($id: uuid!, $user_id: uuid!) {
        workflows_by_pk(id: $id) {
          org_id
          org {
            quota_calls_used
            quota_calls_allowed
            members(where: {user_id: {_eq: $user_id}}) {
              role
            }
          }
        }
      }
    `, { id: workflowId, user_id: userId });

    const wf = wfData.workflows_by_pk;
    if (!wf) return res.status(400).json({ message: "Workflow not found" });

    const member = wf.org.members[0];
    if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
      return res.status(403).json({ message: "Must be owner or editor to trigger" });
    }

    if (wf.org.quota_calls_used >= wf.org.quota_calls_allowed) {
       return res.status(403).json({ message: "Quota exhausted" });
    }

    const createRun = await runQuery(`
      mutation CreateRun($wf_id: uuid!, $org_id: uuid!, $user_id: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $wf_id,
          org_id: $org_id,
          triggered_by: $user_id,
          status: "pending"
        }) { id }
      }
    `, { wf_id: workflowId, org_id: wf.org_id, user_id: userId });

    const runId = createRun.insert_workflow_runs_one.id;

    // Double-fire / concurrency protection (Decision C)
    const startRun = await runQuery(`
      mutation StartRun($id: uuid!) {
        update_workflow_runs(where: {id: {_eq: $id}, status: {_eq: "pending"}}, _set: {status: "running", started_at: "now()"}) {
          returning { id }
        }
      }
    `, { id: runId });

    if (startRun.update_workflow_runs.returning.length === 0) {
      return res.status(400).json({ message: "Someone already started it" });
    }

    // Return IMMEDIATELY so the frontend trusts the DB subscription, not this request (Decision A)
    res.status(200).json({ run_id: runId });

    runEngine(runId).catch(console.error);
  } catch(e: any) {
    res.status(500).json({ message: e.message });
  }
}
