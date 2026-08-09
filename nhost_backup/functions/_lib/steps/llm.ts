import { runQuery } from '../db';

export async function executeLlmStep(config: any, org_id: string, stepRun: any) {
  // Atomic quota increment directly against organizations table (Decision E)
  const quotaQuery = `
    mutation IncrementQuota($org_id: uuid!) {
      update_organizations_by_pk(pk_columns: {id: $org_id}, _inc: {quota_calls_used: 1}) {
        id
        quota_calls_used
        quota_calls_allowed
      }
    }
  `;
  const quotaRes = await runQuery(quotaQuery, { org_id });
  const org = quotaRes.update_organizations_by_pk;
  
  if (org.quota_calls_used > org.quota_calls_allowed) {
    throw new Error("Quota exceeded");
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log("No GROQ_API_KEY found. Falling back to stub with 1.5s delay.");
    await new Promise(r => setTimeout(r, 1500));
    return { response: "Stub LLM response for: " + (config.prompt || "Hello") };
  }

  // Real LLM call with retry + exponential backoff
  let attempt = 0;
  while(attempt < 3) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: config.prompt || "Hello" }]
        })
      });
      if (!res.ok) throw new Error("Groq API error: " + res.status);
      const data = await res.json();
      return { response: data.choices[0].message.content };
    } catch(err) {
      attempt++;
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
