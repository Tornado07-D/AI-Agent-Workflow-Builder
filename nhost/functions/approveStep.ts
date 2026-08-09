import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';
import { FunctionRequest, FunctionResponse } from './_lib/functionTypes';

type ApprovalAccess = {
  step_runs_by_pk: {
    status: string;
    workflow_run: {
      id: string;
      org: { members: { role: 'owner' | 'editor' | 'viewer' }[] };
    };
  } | null;
};

export default async function handler(req: FunctionRequest, res: FunctionResponse) {
  const { input, session_variables } = req.body;
  const stepRunId = input?.step_run_id;
  const userId = session_variables?.['x-hasura-user-id'];
  if (typeof stepRunId !== 'string' || !userId) return res.status(401).json({ message: 'Authentication is required' });

  try {
    const data = await runQuery<ApprovalAccess>(`
      query GetStepRun($id: uuid!, $user_id: uuid!) {
        step_runs_by_pk(id: $id) {
          status
          workflow_run {
            id
            org { members(where: {user_id: {_eq: $user_id}}) { role } }
          }
        }
      }
    `, { id: stepRunId, user_id: userId });
    const stepRun = data.step_runs_by_pk;
    const role = stepRun?.workflow_run.org.members[0]?.role;
    if (!stepRun) return res.status(404).json({ message: 'Step run not found' });
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ message: 'Only owners and editors can approve a step' });
    }

    const approved = await runQuery<{ update_step_runs: { returning: { id: string }[] } }>(`
      mutation ApproveStep($id: uuid!, $user_id: uuid!, $approved_at: timestamptz!) {
        update_step_runs(
          where: {id: {_eq: $id}, status: {_eq: "awaiting_approval"}},
          _set: {status: "succeeded", approved_by: $user_id, approved_at: $approved_at}
        ) { returning { id } }
      }
    `, { id: stepRunId, user_id: userId, approved_at: new Date().toISOString() });
    if (approved.update_step_runs.returning.length !== 1) {
      return res.status(409).json({ message: 'This step is no longer awaiting approval' });
    }

    const runId = stepRun.workflow_run.id;
    const resumed = await runQuery<{ update_workflow_runs: { returning: { id: string }[] } }>(`
      mutation ResumeRun($run_id: uuid!) {
        update_workflow_runs(where: {id: {_eq: $run_id}, status: {_eq: "paused"}}, _set: {status: "running"}) {
          returning { id }
        }
      }
    `, { run_id: runId });
    if (resumed.update_workflow_runs.returning.length !== 1) {
      return res.status(409).json({ message: 'Run is no longer paused' });
    }

    res.status(200).json({ success: true, run_id: runId });
    void runEngine(runId).catch((error) => console.error('Workflow engine failed after approval', error));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Unable to approve step';
    return res.status(500).json({ message });
  }
}
