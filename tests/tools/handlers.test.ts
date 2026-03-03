import { handleToolCall, ToolContext } from '../../src/lib/tools/handlers';

function makeCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    baseUrl: 'https://api.example.com',
    lastResponse: null,
    lastRequest: null,
    variables: {},
    results: [],
    stepCount: 0,
    steps: [],
    ...overrides,
  };
}

describe('tool handlers', () => {
  describe('assert_status', () => {
    it('passes when status matches', async () => {
      const ctx = makeCtx({ lastResponse: { status: 200, headers: {}, body: {}, duration: 10 } });
      const res: any = await handleToolCall('assert_status', { expected: 200 }, ctx);
      expect(res.passed).toBe(true);
    });

    it('fails when status differs', async () => {
      const ctx = makeCtx({ lastResponse: { status: 404, headers: {}, body: {}, duration: 10 } });
      const res: any = await handleToolCall('assert_status', { expected: 200 }, ctx);
      expect(res.passed).toBe(false);
    });

    it('errors when no response', async () => {
      const ctx = makeCtx();
      const res: any = await handleToolCall('assert_status', { expected: 200 }, ctx);
      expect(res.passed).toBe(false);
    });
  });

  describe('assert_body', () => {
    const body = { data: { id: 1, name: 'Test', tags: ['a', 'b'] } };
    const resp = { status: 200, headers: {}, body, duration: 10 };

    it('checks equality by default', async () => {
      const ctx = makeCtx({ lastResponse: resp });
      const res: any = await handleToolCall('assert_body', { path: 'data.name', expected: 'Test' }, ctx);
      expect(res.passed).toBe(true);
    });

    it('checks existence', async () => {
      const ctx = makeCtx({ lastResponse: resp });
      const res: any = await handleToolCall('assert_body', { path: 'data.id', operator: 'exists' }, ctx);
      expect(res.passed).toBe(true);
    });

    it('checks type', async () => {
      const ctx = makeCtx({ lastResponse: resp });
      const res: any = await handleToolCall('assert_body', { path: 'data.tags', operator: 'type', expected: 'array' }, ctx);
      expect(res.passed).toBe(true);
    });
  });

  describe('extract_value / get_variable', () => {
    it('extracts and retrieves', async () => {
      const ctx = makeCtx({ lastResponse: { status: 200, headers: {}, body: { id: 42 }, duration: 5 } });
      await handleToolCall('extract_value', { path: 'id', name: 'userId' }, ctx);
      expect(ctx.variables['userId']).toBe(42);

      const res: any = await handleToolCall('get_variable', { name: 'userId' }, ctx);
      expect(res.value).toBe(42);
    });
  });

  describe('report_result', () => {
    it('logs results', async () => {
      const ctx = makeCtx();
      await handleToolCall('report_result', { testName: 'test1', status: 'pass' }, ctx);
      expect(ctx.results).toHaveLength(1);
      expect(ctx.results[0].status).toBe('pass');
    });
  });
});
