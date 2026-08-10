import { Request, Response } from 'express';
import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';

type EventWorkflow = {
  workflows: { id: string; org_id: string }[];
};

export default async function cronTrigger(req: Request, res: Response) {
  // Validate Nhost webhook secret
  if (req.headers['nhost-webhook-secret'] !== process.env.NHOST_WEBHOOK_SECRET) {
    return res.status(401).send('Unauthorized');
  }

  try {
    // Find all workflows with scheduled triggers
    const triggerData = await runQuery<EventWorkflow>(`
      query GetScheduledWorkflows {
        workflows(where: {triggers: {type: {_eq: "scheduled"}}}) {
          id
          org_id
        }
      }
    `);

    const workflows = triggerData.workflows || [];

    for (const wf of workflows) {
      console.log(`[CRON_TRIGGER] Auto-starting workflow ${wf.id} via schedule.`);
      
      const createRun = await runQuery<{ insert_workflow_runs_one: { id: string } }>(`
        mutation CreateRun($wf_id: uuid!, $org_id: uuid!) {
          insert_workflow_runs_one(object: {
            workflow_id: $wf_id,
            org_id: $org_id,
            status: "pending"
          }) { id }
        }
      `, { wf_id: wf.id, org_id: wf.org_id });

      const runId = createRun.insert_workflow_runs_one.id;

      await runQuery(`
        mutation StartRun($id: uuid!, $started_at: timestamptz!) {
          update_workflow_runs(where: {id: {_eq: $id}, status: {_eq: "pending"}}, _set: {status: "running", started_at: $started_at}) {
            returning { id }
          }
        }
      `, { id: runId, started_at: new Date().toISOString() });

      runEngine(runId).catch(console.error);
    }
  } catch (error) {
    console.error("Error processing cron trigger:", error);
  }

  return res.status(200).send('Cron processed');
}
