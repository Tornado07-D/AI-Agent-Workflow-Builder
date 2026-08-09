import { runQuery } from './db';
import { executeLlmStep } from './steps/llm';
import { executeHttpStep } from './steps/http';

export async function runEngine(runId: string) {
  // 1. Load run + org + ordered steps + existing step_runs
  const query = `
    query GetRunDetails($id: uuid!) {
      workflow_runs_by_pk(id: $id) {
        id
        org_id
        status
        workflow {
          id
          steps(order_by: {step_order: asc}) {
            id
            type
            config
          }
        }
        step_runs {
          id
          workflow_step_id
          status
          output
          attempt_count
        }
      }
    }
  `;
  const data = await runQuery(query, { id: runId });
  const run = data.workflow_runs_by_pk;
  
  if (!run || run.status !== 'running') return;

  const steps = run.workflow.steps;
  const existingStepRuns = run.step_runs;

  let previousOutput: any = null;

  for (const step of steps) {
    let stepRun = existingStepRuns.find((sr: any) => sr.workflow_step_id === step.id);
    
    // Resume logic: already succeeded/skipped, just update previousOutput
    if (stepRun && (stepRun.status === 'succeeded' || stepRun.status === 'skipped')) {
      previousOutput = stepRun.output;
      continue;
    }

    if (!stepRun) {
      const insertRes = await runQuery(`
        mutation InsertStepRun($run_id: uuid!, $step_id: uuid!) {
          insert_step_runs_one(object: {workflow_run_id: $run_id, workflow_step_id: $step_id, status: "pending"}) {
            id attempt_count
          }
        }
      `, { run_id: run.id, step_id: step.id });
      stepRun = insertRes.insert_step_runs_one;
    }

    await runQuery(`
      mutation SetStepRunning($id: uuid!) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: "running"}) { id }
      }
    `, { id: stepRun.id });

    let stepOutput = null;
    let stepError = null;
    let newStatus = 'succeeded';
    
    try {
      // 2. Dispatch by type
      if (step.type === 'llm_call') {
        stepOutput = await executeLlmStep(step.config, run.org_id, stepRun);
      } else if (step.type === 'http_request') {
        stepOutput = await executeHttpStep(step.config, run.org_id, stepRun);
      } else if (step.type === 'conditional_branch') {
        // Evaluate condition against previous step's output
        const fieldVal = previousOutput?.[step.config.field];
        const targetVal = step.config.value;
        let passed = false;
        if (step.config.operator === '>') passed = Number(fieldVal) > Number(targetVal);
        else if (step.config.operator === '==') passed = fieldVal == targetVal;
        else if (step.config.operator === 'contains') passed = String(fieldVal).includes(String(targetVal));
        
        stepOutput = { passed };
        if (!passed) {
           newStatus = 'succeeded'; // The evaluation succeeded, but we branch
        }
      } else if (step.type === 'db_write') {
        stepOutput = { written: true, data: previousOutput };
      } else if (step.type === 'notify') {
        stepOutput = { notified: true };
      } else if (step.type === 'approval_gate') {
        // Stop the loop, pause run
        await runQuery(`
          mutation PauseRun($step_id: uuid!, $run_id: uuid!) {
            update_step_runs_by_pk(pk_columns: {id: $step_id}, _set: {status: "awaiting_approval"}) { id }
            update_workflow_runs_by_pk(pk_columns: {id: $run_id}, _set: {status: "paused"}) { id }
          }
        `, { step_id: stepRun.id, run_id: run.id });
        return; 
      }
    } catch (err: any) {
      stepError = err.message;
      newStatus = 'failed';
    }

    await runQuery(`
      mutation UpdateStepRun($id: uuid!, $status: String!, $output: jsonb, $error: String) {
        update_step_runs_by_pk(pk_columns: {id: $id}, _set: {status: $status, output: $output, error: $error}) { id }
      }
    `, { id: stepRun.id, status: newStatus, output: stepOutput, error: stepError });

    if (newStatus === 'failed') {
      await runQuery(`
        mutation FailRun($id: uuid!) {
          update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {status: "failed", finished_at: "now()"}) { id }
        }
      `, { id: run.id });
      return; 
    }

    // conditional_branch: mark remaining steps skipped if it didn't pass
    if (step.type === 'conditional_branch' && !stepOutput.passed) {
       for (let i = steps.indexOf(step) + 1; i < steps.length; i++) {
           await runQuery(`
              mutation SkipStep($run_id: uuid!, $step_id: uuid!) {
                insert_step_runs_one(object: {workflow_run_id: $run_id, workflow_step_id: $step_id, status: "skipped"}) { id }
              }
           `, { run_id: run.id, step_id: steps[i].id });
       }
       break; // exit loop early, skipping rest
    }

    previousOutput = stepOutput;
  }

  // 3. Final completion
  await runQuery(`
    mutation CompleteRun($id: uuid!) {
      update_workflow_runs_by_pk(pk_columns: {id: $id}, _set: {status: "completed", finished_at: "now()"}) { id }
    }
  `, { id: run.id });
}
