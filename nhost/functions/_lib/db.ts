type GraphqlError = { message?: string };

export async function runQuery<T = Record<string, unknown>>(
  query: string,
  variables: Record<string, unknown> = {},
  headers: Record<string, string> = {}
): Promise<T> {
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
  
  const json = await res.json() as { data?: T; errors?: GraphqlError[] };
  if (json.errors) {
    throw new Error(json.errors.map((error) => error.message ?? 'Unknown GraphQL error').join('; '));
  }
  if (!json.data) {
    throw new Error(`GraphQL request failed with HTTP ${res.status}`);
  }
  return json.data;
}
