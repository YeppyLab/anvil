import { ToolDefinition } from '../adapters/interface';

export const TOOLS: ToolDefinition[] = [
  {
    name: 'call_api',
    description: 'Make an HTTP request to the target API. Returns status code, headers, and body.',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: 'API path (appended to base URL)' },
        headers: { type: 'object', description: 'Additional headers' },
        body: { type: 'object', description: 'Request body (JSON)' },
        queryParams: { type: 'object', description: 'URL query parameters' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'assert_status',
    description: 'Validate the last response status code',
    parameters: {
      type: 'object',
      properties: {
        expected: { type: 'number', description: 'Expected HTTP status code' },
      },
      required: ['expected'],
    },
  },
  {
    name: 'assert_body',
    description: 'Validate the last response body. Use JSON path to check a specific field.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dot-notation JSON path (e.g. "data.id", "items[0].name")' },
        expected: { description: 'Expected value (if omitted, just checks the path exists)' },
        operator: { type: 'string', enum: ['eq', 'neq', 'gt', 'lt', 'contains', 'exists', 'type'], description: 'Comparison operator (default: eq)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'extract_value',
    description: 'Extract a value from the last response and store it as a variable for later use',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Dot-notation JSON path to extract' },
        name: { type: 'string', description: 'Variable name to store the value as' },
      },
      required: ['path', 'name'],
    },
  },
  {
    name: 'get_variable',
    description: 'Retrieve a previously stored variable value',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Variable name' },
      },
      required: ['name'],
    },
  },
  {
    name: 'read_knowledge',
    description: 'Look up detailed API schema information from the knowledge base. Use for deep schema lookups when you need full request/response body details beyond what is in the injected summary.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for (e.g. "user endpoints", "authentication", "create order schema")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a clarifying question when API spec info is insufficient or ambiguous. Wait for their response before proceeding.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question to ask the user' },
      },
      required: ['question'],
    },
  },
  {
    name: 'report_result',
    description: 'Log a test result (pass/fail/warn)',
    parameters: {
      type: 'object',
      properties: {
        testName: { type: 'string' },
        status: { type: 'string', enum: ['pass', 'fail', 'warn'] },
        message: { type: 'string' },
      },
      required: ['testName', 'status'],
    },
  },
];
