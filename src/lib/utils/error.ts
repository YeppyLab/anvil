/**
 * Extract the most useful error message from any error, with special handling for axios errors.
 * Priority: err.response.data.error.message → JSON.stringify(err.response.data) → err.message
 */
export function extractErrorMessage(err: any): string {
  if (err?.response?.data) {
    const data = err.response.data;
    if (data?.error?.message) {
      return `${data.error.type ? data.error.type + ': ' : ''}${data.error.message}`;
    }
    if (typeof data === 'string') {
      return data;
    }
    try {
      return JSON.stringify(data);
    } catch {
      // fall through
    }
  }
  return err?.message || String(err);
}
