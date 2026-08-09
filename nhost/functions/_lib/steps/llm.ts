import { runQuery } from '../db';

type QuotaMutation = { update_organizations: { affected_rows: number } };

export async function executeLlmStep(config: any, org_id: string, stepRun: any) {
  // Claim one quota unit atomically. No request can take the count over the limit.
  const quotaQuery = `
    mutation IncrementQuota($org_id: uuid!) {
      update_organizations(where: {id: {_eq: $org_id}}, _inc: {quota_calls_used: 1}) {
        affected_rows
      }
    }
  `;
  const quotaRes = await runQuery<QuotaMutation>(quotaQuery, { org_id });
  if (quotaRes.update_organizations.affected_rows !== 1) {
    throw new Error("Quota exceeded");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("No GROQ_API_KEY found. Falling back to a deterministic local stub.");
    await new Promise(r => setTimeout(r, 1500));
    return {
      response: "Stub LLM response for: " + (config.prompt || "Hello"),
      score: typeof config.stub_score === 'number' ? config.stub_score : 8,
      stub: true
    };
  }

  // Real Groq call with retry, timeout, and durable attempt accounting.
  let attempt = 0;
  while(attempt < 3) {
    try {
      attempt++;
      await runQuery(`
        mutation IncrementAttempt($id: uuid!) {
          update_step_runs_by_pk(pk_columns: {id: $id}, _inc: {attempt_count: 1}) { id }
        }
      `, { id: stepRun.id });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'llama-3.1-8b-instant',
          messages: [{ role: 'user', content: config.prompt || 'Hello' }],
          temperature: 0.2
        }),
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("Groq API error: " + res.status);
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      let structuredOutput = {};
      if (jsonMatch) {
        try { structuredOutput = JSON.parse(jsonMatch[0]); } catch { /* retain text-only output */ }
      }
      return { response: text, ...structuredOutput };
    } catch(err) {
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
