import { Request, Response } from 'express';
import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';

export default async function handler(req: Request, res: Response) {
  const { workflow_id, token } = req.body;
  
  try {
    const wfData = await runQuery(`
      query GetWebhookWf($id: uuid!) {
        workflows_by_pk(id: $id) {
          org_id
          triggers(where: {type: {_eq: "webhook"}}) {
            config
          }
        }
      }
    `, { id: workflow_id });

    const wf = wfData.workflows_by_pk;
    if (!wf || wf.triggers.length === 0) return res.status(404).json({ message: "Webhook not found" });

    // Validate per-workflow secret token
    const trigger = wf.triggers[0];
    if (trigger.config.token !== token) {
      return res.status(403).json({ message: "Invalid webhook token" });
    }

    const createRun = await runQuery(`
      mutation CreateRun($wf_id: uuid!, $org_id: uuid!) {
        insert_workflow_runs_one(object: {
          workflow_id: $wf_id,
          org_id: $org_id,
          status: "pending"
        }) { id }
      }
    `, { wf_id: workflow_id, org_id: wf.org_id });

    const runId = createRun.insert_workflow_runs_one.id;

    const startRun = await runQuery(`
      mutation StartRun($id: uuid!) {
        update_workflow_runs(where: {id: {_eq: $id}, status: {_eq: "pending"}}, _set: {status: "running", started_at: "now()"}) {
          returning { id }
        }
      }
    `, { id: runId });

    res.status(200).json({ run_id: runId });

    runEngine(runId).catch(console.error);
  } catch(e: any) {
    res.status(500).json({ message: e.message });
  }
}
