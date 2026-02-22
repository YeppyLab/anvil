export interface TestResult {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
}

export function generateMarkdownReport(results: TestResult[]): string {
  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warned = results.filter(r => r.status === 'warn').length;

  let md = `# Test Report\n\n`;
  md += `**Total:** ${results.length} | ✅ ${passed} | ❌ ${failed} | ⚠️ ${warned}\n\n`;
  md += `| Test | Status | Message |\n|------|--------|--------|\n`;

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
    md += `| ${r.name} | ${icon} ${r.status} | ${r.message || ''} |\n`;
  }

  return md;
}
