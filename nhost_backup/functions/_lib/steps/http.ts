export async function executeHttpStep(config: any, org_id: string, stepRun: any) {
  const url = config.url;
  const method = config.method || 'GET';
  
  let attempt = 0;
  while(attempt < 3) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      
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
      attempt++;
      if (attempt >= 3) throw err;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
}
