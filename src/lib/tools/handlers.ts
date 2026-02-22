// TODO: implement tool handlers
export async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'call_api':
      // TODO: use executor
      return { status: 501, body: 'Not yet implemented' };
    case 'assert_status':
      return { passed: false, message: 'Not yet implemented' };
    case 'assert_body':
      return { passed: false, message: 'Not yet implemented' };
    case 'extract_value':
      return { value: null, message: 'Not yet implemented' };
    case 'report_result':
      return { logged: true };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
