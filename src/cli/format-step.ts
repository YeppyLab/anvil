import { StepEntry, maskHeaders, truncate } from '../lib/step-log';

export interface FormatOptions {
  verbose?: boolean;
  maxBodyChars?: number;
}

export function formatStep(step: StepEntry, opts: FormatOptions = {}): string {
  const maxChars = opts.maxBodyChars ?? 500;
  const lines: string[] = [];

  if (step.toolName === 'call_api') {
    const req = step.request!;
    const masked = maskHeaders(req.headers);

    lines.push(`\n  ┌─ Step ${step.stepNumber}: ${req.method} ${req.url}`);

    if (opts.verbose) {
      lines.push(`  │ Request Headers:`);
      for (const [k, v] of Object.entries(masked)) {
        lines.push(`  │   ${k}: ${v}`);
      }
    }

    if (req.body) {
      lines.push(`  │ Request Body:`);
      lines.push(indent(truncate(req.body, maxChars), '  │   '));
    }

    if (step.error) {
      lines.push(`  │ ❌ Error: ${step.error}`);
    } else if (step.response) {
      const res = step.response;
      const statusIcon = res.status >= 200 && res.status < 300 ? '✅' : res.status >= 400 ? '❌' : '⚠️';
      lines.push(`  │ ${statusIcon} Response: ${res.status} (${res.duration}ms)`);

      if (opts.verbose) {
        lines.push(`  │ Response Headers:`);
        for (const [k, v] of Object.entries(res.headers)) {
          lines.push(`  │   ${k}: ${v}`);
        }
      }

      if (res.body !== undefined && res.body !== null && res.body !== '') {
        lines.push(`  │ Response Body:`);
        lines.push(indent(truncate(res.body, maxChars), '  │   '));
      }
    }
    lines.push(`  └─`);

  } else if (step.toolName === 'assert_status' || step.toolName === 'assert_body') {
    const a = step.assertion!;
    const icon = a.passed ? '✅' : '❌';
    lines.push(`  ${icon} Assert ${a.type}: ${a.message}`);
    if (!a.passed) {
      lines.push(`     Expected: ${JSON.stringify(a.expected)}`);
      lines.push(`     Actual:   ${JSON.stringify(a.actual)}`);
    }

  } else if (step.toolName === 'extract_value') {
    const e = step.extraction!;
    lines.push(`  📎 Extracted "${e.name}" = ${truncate(e.value, 100)}`);

  } else if (step.toolName === 'report_result') {
    const r = step.result!;
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    lines.push(`  ${icon} ${r.testName}${r.message ? ` — ${r.message}` : ''}`);
  }

  return lines.join('\n');
}

function indent(text: string, prefix: string): string {
  return text.split('\n').map(line => `${prefix}${line}`).join('\n');
}
