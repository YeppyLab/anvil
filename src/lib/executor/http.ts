import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export interface ExecutionResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
}

export async function executeRequest(config: AxiosRequestConfig): Promise<ExecutionResult> {
  const start = Date.now();
  const response: AxiosResponse = await axios(config);
  const duration = Date.now() - start;

  return {
    status: response.status,
    headers: response.headers as Record<string, string>,
    body: response.data,
    duration,
  };
}
