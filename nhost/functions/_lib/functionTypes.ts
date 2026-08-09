export type FunctionRequest = {
  body: {
    input?: Record<string, unknown>;
    session_variables?: Record<string, string>;
    workflow_id?: string;
    token?: string;
  };
};

export type FunctionResponse = {
  status: (code: number) => FunctionResponse;
  json: (body: Record<string, unknown>) => FunctionResponse;
};
