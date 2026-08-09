import { runQuery } from './_lib/db';
import { runEngine } from './_lib/runEngine';
import { FunctionRequest, FunctionResponse } from './_lib/functionTypes';

type WorkflowAccess = {
  workflows_by_pk: {
    org_id: string;
    org: {
      quota_calls_used: number;
      quota_calls_allowed: number;
      members: { role: 'owner' | 'editor' | 'viewer' }[];
    };
  } | null;
};

type ActiveRun = { workflow_runs: { id: string; status: string }[] };

async function findActiveRun(workflowId: string, userId: string) {
  const active = await runQuery<ActiveRun>(`
    query ActiveRun($workflow_id: uuid!, $user_id: uuid!) {
      workflow_runs(
        where: {
          workflow_id: {_eq: $workflow_id},
          triggered_by: {_eq: $user_id},
          status: {_in: ["pending", "running", "paused"]}
        },
        order_by: {created_at: desc},
        limit: 1
      ) { id status }
    }
  `, { workflow_id: workflowId, user_id: userId });
  return active.workflow_runs[0] ?? null;
}

export default async function handler(req: FunctionRequest, res: FunctionResponse) {
  const { input, session_variables } = req.body;
  const workflowId = input?.workflow_id;
  const userId = session_variables?.['x-hasura-user-id'];
  if (typeof workflowId !== 'string' || !userId) return res.status(401).json({ message: 'Authentication is required' });

  try {
    const workflowData = await runQuery<WorkflowAccess>(`
      query GetWorkflowAccess($id: uuid!, $user_id: uuid!) {
        workflows_by_pk(id: $id) {
          org_id
          org {
            quota_calls_used quota_calls_allowed
            members(where: {user_id: {_eq: $user_id}}) { role }
          }
        }
      }
    `, { id: workflowId, user_id: userId });
    const workflow = workflowData.workflows_by_pk;
    const role = workflow?.org.members[0]?.role;
    if (!workflow) return res.status(404).json({ message: 'Workflow not found' });
    if (role !== 'owner' && role !== 'editor') {
      return res.status(403).json({ message: 'Only owners and editors can trigger a workflow' });
    }
    if (workflow.org.quota_calls_used >= workflow.org.quota_calls_allowed) {
      return res.status(403).json({ message: 'Quota exhausted' });
    }

    let runId: string;
    try {
      const created = await runQuery<{ insert_workflow_runs_one: { id: string } }>(`
        mutation CreateRun($workflow_id: uuid!, $org_id: uuid!, $user_id: uuid!) {
          insert_workflow_runs_one(object: {
            workflow_id: $workflow_id, org_id: $org_id, triggered_by: $user_id, status: "pending"
          }) { id }
        }
      `, { workflow_id: workflowId, org_id: workflow.org_id, user_id: userId });
      runId = created.insert_workflow_runs_one.id;
    } catch (reason) {
      // The partial unique index makes a rapid second click return the existing
      // active run instead of creating another one and charging quota twice.
      const active = await findActiveRun(workflowId, userId);
      if (!active) throw reason;
      return res.status(200).json({ run_id: active.id });
    }

    const started = await runQuery<{ update_workflow_runs: { returning: { id: string }[] } }>(`
      mutation StartRun($id: uuid!, $started_at: timestamptz!) {
        update_workflow_runs(
          where: {id: {_eq: $id}, status: {_eq: "pending"}},
          _set: {status: "running", started_at: $started_at}
        ) { returning { id } }
      }
    `, { id: runId, started_at: new Date().toISOString() });
    if (started.update_workflow_runs.returning.length !== 1) {
      return res.status(409).json({ message: 'Run could not be started' });
    }

    res.status(200).json({ run_id: runId });
    void runEngine(runId).catch((error) => console.error('Workflow engine failed', error));
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : 'Unable to trigger workflow';
    return res.status(500).json({ message });
  }
}
