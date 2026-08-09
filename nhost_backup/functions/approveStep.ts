import { Request, Response } from 'express';
import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';

export default async function handler(req: Request, res: Response) {
  const { input, session_variables } = req.body;
  const stepRunId = input.step_run_id;
  const userId = session_variables['x-hasura-user-id'];

  try {
    // Layer 2 gating in code - verify approver role mid-execution
    const data = await runQuery(`
      query GetStepRun($id: uuid!, $user_id: uuid!) {
        step_runs_by_pk(id: $id) {
          status
          workflow_run {
            id
            org_id
            status
            org {
              members(where: {user_id: {_eq: $user_id}}) {
                role
              }
            }
          }
        }
      }
    `, { id: stepRunId, user_id: userId });

    const stepRun = data.step_runs_by_pk;
    if (!stepRun) return res.status(404).json({ message: "Step run not found" });
    
    const member = stepRun.workflow_run.org.members[0];
    if (!member || (member.role !== 'owner' && member.role !== 'editor')) {
      return res.status(403).json({ message: "Must be owner or editor to approve" });
    }

    if (stepRun.status !== 'awaiting_approval') {
      return res.status(400).json({ message: "Step is not awaiting approval" });
    }

    const runId = stepRun.workflow_run.id;

    // Concurrency protection on Resume (Decision C)
    const resume = await runQuery(`
      mutation ResumeRun($run_id: uuid!) {
        update_workflow_runs(where: {id: {_eq: $run_id}, status: {_eq: "paused"}}, _set: {status: "running"}) {
          returning { id }
        }
      }
    `, { run_id: runId });

    if (resume.update_workflow_runs.returning.length === 0) {
      return res.status(400).json({ message: "Already resumed or not paused" });
    }

    await runQuery(`
      mutation ApproveStep($id: uuid!, $user_id: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: "succeeded", approved_by: $user_id, approved_at: "now()"}) { id }
      }
    `, { id: stepRunId, user_id: userId });

    res.status(200).json({ success: true, run_id: runId });

    runEngine(runId).catch(console.error);
  } catch(e: any) {
    res.status(500).json({ message: e.message });
  }
}
