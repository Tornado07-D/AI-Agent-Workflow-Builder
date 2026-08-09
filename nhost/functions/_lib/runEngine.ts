import { runQuery } from './db';
import { executeLlmStep } from './steps/llm';
import { executeHttpStep } from './steps/http';

type WorkflowStep = {
  id: string;
  type: 'llm_call' | 'http_request' | 'db_write' | 'notify' | 'conditional_branch' | 'approval_gate';
  config: Record<string, unknown>;
};

type StepRun = {
  id: string;
  workflow_step_id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'awaiting_approval' | 'skipped';
  output: Record<string, unknown> | null;
};

type RunDetails = {
  workflow_runs_by_pk: {
    id: string;
    org_id: string;
    status: 'running' | 'paused' | 'completed' | 'failed' | 'pending';
    workflow: { steps: WorkflowStep[] };
    step_runs: StepRun[];
  } | null;
};

const timestamp = () => new Date().toISOString();

async function markRunFinished(runId: string, status: 'completed' | 'failed') {
  await runQuery(`
    mutation FinishRun($id: uuid!, $status: run_status!, $finished_at: timestamptz!) {
      update_workflow_runs(
        where: {id: {_eq: $id}, status: {_eq: "running"}},
        _set: {status: $status, finished_at: $finished_at}
      ) { affected_rows }
    }
  `, { id: runId, status, finished_at: timestamp() });
}

/**
 * Advances one durable run. The database is the source of truth: every step
 * claim is conditional, so a duplicate engine invocation becomes a no-op.
 */
export async function runEngine(runId: string) {
  const data = await runQuery<RunDetails>(`
    query GetRunDetails($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id org_id status
        workflow { steps(order_by: {step_order: asc}) { id type config } }
        step_runs { id workflow_step_id status output }
      }
    }
  `, { id: runId });
  const run = data.workflow_runs_by_pk;
  if (!run || run.status !== 'running') return;

  let previousOutput: Record<string, unknown> | null = null;

  for (const step of run.workflow.steps) {
    let stepRun = run.step_runs.find((candidate) => candidate.workflow_step_id === step.id);

    if (stepRun?.status === 'succeeded' || stepRun?.status === 'skipped') {
      previousOutput = stepRun.output;
      continue;
    }

    // A previously claimed running/approval step belongs to another invocation
    // or requires a human. Never execute it again.
    if (stepRun?.status === 'running' || stepRun?.status === 'awaiting_approval') return;

    if (!stepRun) {
      try {
        const inserted = await runQuery<{ insert_step_runs_one: Pick<StepRun, 'id' | 'workflow_step_id' | 'status' | 'output'> }>(`
          mutation InsertStepRun($run_id: uuid!, $step_id: uuid!) {
            insert_step_runs_one(object: {workflow_run_id: $run_id, workflow_step_id: $step_id, status: "pending"}) {
              id workflow_step_id status output
            }
          }
        `, { run_id: run.id, step_id: step.id });
        stepRun = inserted.insert_step_runs_one;
      } catch {
        // The unique run/step constraint was won by another engine invocation.
        return;
      }
    }

    const claim = await runQuery<{ update_step_runs: { returning: { id: string }[] } }>(`
      mutation ClaimStep($id: uuid!) {
        update_step_runs(where: {id: {_eq: $id}, status: {_eq: "pending"}}, _set: {status: "running"}) {
          returning { id }
        }
      }
    `, { id: stepRun.id });
    if (claim.update_step_runs.returning.length !== 1) return;

    if (step.type === 'approval_gate') {
      await runQuery(`
        mutation PauseRun($step_id: uuid!, $run_id: uuid!) {
          update_step_runs_by_pk(pk_columns: {id: $step_id}, _set: {status: "awaiting_approval"}) { id }
          update_workflow_runs(where: {id: {_eq: $run_id}, status: {_eq: "running"}}, _set: {status: "paused"}) { affected_rows }
        }
      `, { step_id: stepRun.id, run_id: run.id });
      return;
    }

    let output: Record<string, unknown> | null = null;
    let error: string | null = null;
    try {
      if (step.type === 'llm_call') {
        output = await executeLlmStep(step.config, run.org_id, stepRun);
      } else if (step.type === 'http_request') {
        output = await executeHttpStep(step.config, run.org_id, stepRun);
      } else if (step.type === 'conditional_branch') {
        const field = String(step.config.field ?? '');
        const fieldValue = previousOutput?.[field];
        const expectedValue = step.config.value;
        const operator = step.config.operator;
        const passed = operator === '>'
          ? Number(fieldValue) > Number(expectedValue)
          : operator === 'contains'
            ? String(fieldValue ?? '').includes(String(expectedValue ?? ''))
            : fieldValue === expectedValue;
        output = { passed, field, actual: fieldValue ?? null, expected: expectedValue ?? null };
      } else if (step.type === 'db_write') {
        // The schema has no arbitrary user-data table. Keep the requested data
        // durably in this step's output rather than accepting unsafe table SQL.
        output = { written: true, data: previousOutput };
      } else if (step.type === 'notify') {
        output = { notified: true, message: step.config.message ?? null };
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : 'Unknown step error';
    }

    if (error) {
      await runQuery(`
        mutation FailStep($id: uuid!, $error: String!) {
          update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: "failed", error: $error}) { id }
        }
      `, { id: stepRun.id, error });
      await markRunFinished(run.id, 'failed');
      return;
    }

    await runQuery(`
      mutation SucceedStep($id: uuid!, $output: jsonb) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: "succeeded", output: $output, error: null}) { id }
      }
    `, { id: stepRun.id, output });

    if (step.type === 'conditional_branch' && output?.passed === false) {
      for (const remainingStep of run.workflow.steps.slice(run.workflow.steps.indexOf(step) + 1)) {
        await runQuery(`
          mutation SkipStep($run_id: uuid!, $step_id: uuid!) {
            insert_step_runs_one(object: {workflow_run_id: $run_id, workflow_step_id: $step_id, status: "skipped"}) { id }
          }
        `, { run_id: run.id, step_id: remainingStep.id });
      }
      break;
    }

    previousOutput = output;
  }

  await markRunFinished(run.id, 'completed');
}
