export interface StepRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: unknown;
  queryParams?: Record<string, string>;
}

export interface StepResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  duration: number;
}

export interface StepAssertion {
  type: 'status' | 'body';
  passed: boolean;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface StepEntry {
  stepNumber: number;
  toolName: string;
  request?: StepRequest;
  response?: StepResponse;
  assertion?: StepAssertion;
  extraction?: { name: string; value: unknown };
  result?: { testName: string; status: string; message?: string };
  error?: string;
  timestamp: number;
}

export type StepCallback = (step: StepEntry) => void;

const SENSITIVE_HEADERS = ['authorization', 'x-api-key', 'api-key', 'token', 'cookie'];

export function maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
      masked[key] = value.slice(0, 8) + '***';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function truncate(value: unknown, maxChars = 500): string {
  const str = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!str) return '';
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars) + `\n... (truncated, ${str.length} chars total)`;
}
