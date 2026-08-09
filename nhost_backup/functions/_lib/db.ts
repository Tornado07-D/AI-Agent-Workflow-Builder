export async function runQuery(query: string, variables: any = {}, headers: any = {}) {
  const url = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
  const adminSecret = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';
  
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hasura-admin-secret': adminSecret,
      ...headers
    },
    body: JSON.stringify({ query, variables })
  });
  
  const json = await res.json();
  if (json.errors) {
    throw new Error(JSON.stringify(json.errors));
  }
  return json.data;
}
