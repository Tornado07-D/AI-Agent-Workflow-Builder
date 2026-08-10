import { runQuery } from '../db';

export async function executeHttpStep(config: any, org_id: string, stepRun: any) {
  const url = config.url;
  if (!url) throw new Error("HTTP step failed: No URL provided in config.");

  const method = config.method || 'GET';
  
  let attempt = 0;
  while(attempt < 3) {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      attempt++;
      await runQuery(`
        mutation IncrementAttempt($id: uuid!) {
          update_step_runs_by_pk(pk_columns: {id: $id}, _inc: {attempt_count: 1}) { id }
        }
      `, { id: stepRun.id });
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 8000); // 8s to leave time for db write
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: ['POST', 'PUT'].includes(method) ? JSON.stringify(config.body) : undefined,
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      if (!res.ok) throw new Error("HTTP error: " + res.status);
      try {
        return await res.json();
      } catch(e) {
        return { response: await res.text() };
      }
    } catch(err) {
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000)); // Fixed 1s backoff to avoid lambda 10s kill limit
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
