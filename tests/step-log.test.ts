import { maskHeaders, truncate } from '../src/lib/step-log';
import { formatStep } from '../src/cli/format-step';

describe('maskHeaders', () => {
  it('masks sensitive headers', () => {
    const masked = maskHeaders({
      'Authorization': 'Bearer sk-1234567890abcdef',
      'Content-Type': 'application/json',
      'X-API-Key': 'my-secret-key-12345',
    });
    expect(masked['Authorization']).toBe('Bearer s***');
    expect(masked['Content-Type']).toBe('application/json');
    expect(masked['X-API-Key']).toBe('my-secre***');
  });
});

describe('truncate', () => {
  it('leaves short strings intact', () => {
    expect(truncate('hello')).toBe('hello');
  });

  it('truncates long strings', () => {
    const long = 'a'.repeat(600);
    const result = truncate(long, 500);
    expect(result.length).toBeLessThan(600);
    expect(result).toContain('truncated');
    expect(result).toContain('600 chars total');
  });

  it('handles objects', () => {
    const result = truncate({ key: 'value' });
    expect(result).toContain('"key"');
  });
});

describe('formatStep', () => {
  it('formats a call_api step', () => {
    const output = formatStep({
      stepNumber: 1,
      toolName: 'call_api',
      request: {
        method: 'GET',
        url: 'https://api.example.com/users',
        headers: { 'Authorization': 'Bearer secret123', 'Content-Type': 'application/json' },
      },
      response: { status: 200, headers: {}, body: { id: 1 }, duration: 42 },
      timestamp: Date.now(),
    });
    expect(output).toContain('GET https://api.example.com/users');
    expect(output).toContain('200');
    expect(output).toContain('42ms');
    expect(output).not.toContain('secret123');
  });

  it('formats assertion steps', () => {
    const output = formatStep({
      stepNumber: 2,
      toolName: 'assert_status',
      assertion: { type: 'status', passed: true, expected: 200, actual: 200, message: 'Status matches' },
      timestamp: Date.now(),
    });
    expect(output).toContain('✅');
    expect(output).toContain('Status matches');
  });

  it('shows verbose headers when requested', () => {
    const output = formatStep({
      stepNumber: 1,
      toolName: 'call_api',
      request: {
        method: 'POST',
        url: 'https://api.example.com/users',
        headers: { 'Content-Type': 'application/json', 'X-Custom': 'value' },
        body: { name: 'test' },
      },
      response: { status: 201, headers: { 'x-request-id': 'abc' }, body: { id: 1 }, duration: 100 },
      timestamp: Date.now(),
    }, { verbose: true });
    expect(output).toContain('Request Headers');
    expect(output).toContain('X-Custom: value');
    expect(output).toContain('Response Headers');
    expect(output).toContain('x-request-id: abc');
  });

  it('formats extraction steps', () => {
    const output = formatStep({
      stepNumber: 3,
      toolName: 'extract_value',
      extraction: { name: 'userId', value: 42 },
      timestamp: Date.now(),
    });
    expect(output).toContain('📎');
    expect(output).toContain('userId');
    expect(output).toContain('42');
  });
});
