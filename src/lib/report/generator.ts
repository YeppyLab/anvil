import { StepEntry, maskHeaders, truncate } from '../step-log';

export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
}

export function generateMarkdownReport(results: TestResult[], steps?: StepEntry[]): string {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  let md = `# Test Report\n\n`;
  md += `**Total:** ${results.length} | ✅ ${passed} | ❌ ${failed} | ⚠️ ${warned}\n\n`;

  // Summary table
  md += `## Summary\n\n`;
  md += `| Test | Status | Message |\n|------|--------|--------|\n`;
  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    md += `| ${r.name} | ${icon} ${r.status} | ${r.message || ''} |\n`;
  }

  // Step details
  if (steps && steps.length > 0) {
    md += `\n## Step Details\n\n`;

    for (const step of steps) {
      if (step.toolName === 'call_api' && step.request) {
        const req = step.request;
        const masked = maskHeaders(req.headers);

        md += `### Step ${step.stepNumber}: \`${req.method} ${req.url}\`\n\n`;

        md += `**Request Headers:**\n\`\`\`\n`;
        for (const [k, v] of Object.entries(masked)) {
          md += `${k}: ${v}\n`;
        }
        md += `\`\`\`\n\n`;

        if (req.body) {
          md += `**Request Body:**\n\`\`\`json\n${truncate(req.body, 1000)}\n\`\`\`\n\n`;
        }

        if (step.error) {
          md += `**Error:** ${step.error}\n\n`;
        } else if (step.response) {
          const res = step.response;
          md += `**Response:** \`${res.status}\` (${res.duration}ms)\n\n`;

          md += `**Response Headers:**\n\`\`\`\n`;
          for (const [k, v] of Object.entries(res.headers)) {
            md += `${k}: ${v}\n`;
          }
          md += `\`\`\`\n\n`;

          if (res.body !== undefined && res.body !== null) {
            md += `**Response Body:**\n\`\`\`json\n${truncate(res.body, 1000)}\n\`\`\`\n\n`;
          }
        }
      } else if (step.assertion) {
        const a = step.assertion;
        const icon = a.passed ? '✅' : '❌';
        md += `- ${icon} **Assert ${a.type}:** ${a.message}`;
        if (!a.passed) {
          md += ` (expected: \`${JSON.stringify(a.expected)}\`, actual: \`${JSON.stringify(a.actual)}\`)`;
        }
        md += `\n`;
      } else if (step.extraction) {
        md += `- 📎 **Extracted** \`${step.extraction.name}\` = \`${truncate(step.extraction.value, 100)}\`\n`;
      } else if (step.result) {
        const r = step.result;
        const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
        md += `- ${icon} **${r.testName}**${r.message ? `: ${r.message}` : ''}\n`;
      }
    }
  }

  return md;
}
