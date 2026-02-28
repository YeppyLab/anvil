import { executeRequest, ExecutionResult } from '../executor/http';
import * as fs from 'fs';
import * as path from 'path';

export interface ToolContext {
  baseUrl: string;
  auth?: { type: string; token?: string; header?: string };
  knowledgeDir?: string;
  lastResponse: ExecutionResult | null;
  variables: Record<string, unknown>;
  results: TestResult[];
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<unknown> {
  switch (name) {
    case 'call_api':
      return callApi(args, ctx);
    case 'assert_status':
      return assertStatus(args, ctx);
    case 'assert_body':
      return assertBody(args, ctx);
    case 'extract_value':
      return extractValue(args, ctx);
    case 'get_variable':
      return getVariable(args, ctx);
    case 'read_knowledge':
      return readKnowledge(args, ctx);
    case 'report_result':
      return reportResult(args, ctx);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

async function callApi(args: Record<string, unknown>, ctx: ToolContext) {
  const method = (args.method as string).toUpperCase();
  const apiPath = interpolateVars(args.path as string, ctx.variables);
  const url = `${ctx.baseUrl.replace(/\/$/, '')}${apiPath.startsWith('/') ? '' : '/'}${apiPath}`;

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Auth
  if (ctx.auth?.type === 'bearer' && ctx.auth.token) {
    headers['Authorization'] = `Bearer ${ctx.auth.token}`;
  } else if (ctx.auth?.type === 'api-key' && ctx.auth.token && ctx.auth.header) {
    headers[ctx.auth.header] = ctx.auth.token;
  }

  // Merge custom headers
  if (args.headers && typeof args.headers === 'object') {
    Object.assign(headers, args.headers);
  }

  // Interpolate variables in body
  let body = args.body;
  if (body && typeof body === 'object') {
    body = JSON.parse(interpolateVars(JSON.stringify(body), ctx.variables));
  }

  try {
    const result = await executeRequest({
      method,
      url,
      headers,
      data: body,
      params: args.queryParams as Record<string, string> | undefined,
      validateStatus: () => true, // don't throw on non-2xx
    });
    ctx.lastResponse = result;
    return {
      status: result.status,
      body: result.body,
      duration: `${result.duration}ms`,
    };
  } catch (err: any) {
    return { error: err.message };
  }
}

function assertStatus(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.lastResponse) return { passed: false, message: 'No response to check — call call_api first' };
  const expected = args.expected as number;
  const actual = ctx.lastResponse.status;
  const passed = actual === expected;
  return { passed, expected, actual, message: passed ? 'Status matches' : `Expected ${expected}, got ${actual}` };
}

function assertBody(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.lastResponse) return { passed: false, message: 'No response to check' };

  const jsonPath = args.path as string;
  const operator = (args.operator as string) || 'eq';
  const actual = getByPath(ctx.lastResponse.body, jsonPath);

  if (actual === undefined && operator !== 'exists') {
    return { passed: false, message: `Path "${jsonPath}" not found in response` };
  }

  switch (operator) {
    case 'exists':
      return { passed: actual !== undefined, actual, message: actual !== undefined ? 'Path exists' : `Path "${jsonPath}" not found` };
    case 'eq':
      const passed = JSON.stringify(actual) === JSON.stringify(args.expected);
      return { passed, expected: args.expected, actual, message: passed ? 'Values match' : 'Values do not match' };
    case 'neq':
      const neq = JSON.stringify(actual) !== JSON.stringify(args.expected);
      return { passed: neq, expected: args.expected, actual };
    case 'gt':
      return { passed: (actual as number) > (args.expected as number), actual, expected: args.expected };
    case 'lt':
      return { passed: (actual as number) < (args.expected as number), actual, expected: args.expected };
    case 'contains':
      const contains = typeof actual === 'string'
        ? actual.includes(args.expected as string)
        : Array.isArray(actual) && actual.includes(args.expected);
      return { passed: contains, actual, expected: args.expected };
    case 'type':
      const typeMatch = typeof actual === args.expected || (Array.isArray(actual) && args.expected === 'array');
      return { passed: typeMatch, actualType: Array.isArray(actual) ? 'array' : typeof actual, expected: args.expected };
    default:
      return { passed: false, message: `Unknown operator: ${operator}` };
  }
}

function extractValue(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.lastResponse) return { error: 'No response to extract from' };
  const jsonPath = args.path as string;
  const name = args.name as string;
  const value = getByPath(ctx.lastResponse.body, jsonPath);
  if (value === undefined) return { error: `Path "${jsonPath}" not found in response` };
  ctx.variables[name] = value;
  return { name, value };
}

function getVariable(args: Record<string, unknown>, ctx: ToolContext) {
  const name = args.name as string;
  if (!(name in ctx.variables)) return { error: `Variable "${name}" not found` };
  return { name, value: ctx.variables[name] };
}

async function readKnowledge(args: Record<string, unknown>, ctx: ToolContext) {
  if (!ctx.knowledgeDir) return { error: 'No knowledge directory configured' };
  const query = (args.query as string).toLowerCase();

  try {
    const files = fs.readdirSync(ctx.knowledgeDir).filter(f => f.endsWith('.md'));
    if (files.length === 0) return { message: 'Knowledge base is empty. No API specs have been imported yet.' };

    // Simple keyword search across knowledge files
    const results: { file: string; content: string }[] = [];
    for (const file of files) {
      const content = fs.readFileSync(path.join(ctx.knowledgeDir, file), 'utf-8');
      if (content.toLowerCase().includes(query) || file.toLowerCase().includes(query)) {
        results.push({ file, content: content.slice(0, 3000) });
      }
    }

    if (results.length === 0) {
      // Return all files as fallback
      return {
        message: `No exact match for "${query}". Available knowledge files:`,
        files: files,
        hint: 'Try reading with a broader query, or use a filename.',
      };
    }

    return { results };
  } catch {
    return { error: 'Failed to read knowledge directory' };
  }
}

function reportResult(args: Record<string, unknown>, ctx: ToolContext) {
  const result: TestResult = {
    testName: args.testName as string,
    status: args.status as 'pass' | 'fail' | 'warn',
    message: args.message as string | undefined,
  };
  ctx.results.push(result);
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : '⚠️';
  return { logged: true, summary: `${icon} ${result.testName}: ${result.status}${result.message ? ' — ' + result.message : ''}` };
}

// Utilities

function getByPath(obj: unknown, path: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function interpolateVars(str: string, vars: Record<string, unknown>): string {
  return str.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    return name in vars ? String(vars[name]) : `{{${name}}}`;
  });
}
