import { ToolDefinition } from '../adapters/interface';

export const TOOLS: ToolDefinition[] = [
  {
    name: 'call_api',
    description: 'Make an HTTP request to the target API',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
        path: { type: 'string', description: 'API path (appended to base URL)' },
        headers: { type: 'object', description: 'Additional headers' },
        body: { type: 'object', description: 'Request body (JSON)' },
      },
      required: ['method', 'path'],
    },
  },
  {
    name: 'assert_status',
    description: 'Validate the response status code',
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
    description: 'Validate response body contains expected values',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'JSON path to check' },
        expected: { description: 'Expected value' },
      },
      required: ['path'],
    },
  },
  {
    name: 'extract_value',
    description: 'Extract a value from the response for use in subsequent steps',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'JSON path to extract' },
        name: { type: 'string', description: 'Variable name to store the value' },
      },
      required: ['path', 'name'],
    },
  },
  {
    name: 'report_result',
    description: 'Log a test result',
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
