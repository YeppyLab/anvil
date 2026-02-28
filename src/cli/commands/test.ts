import { loadConfig } from '../../lib/config';
import { createAdapter } from '../../lib/adapters/factory';
import { AgentCore } from '../../lib/agent/core';

export async function runTest(args: string[]): Promise<void> {
  const scenario = args.join(' ');
  if (!scenario) {
    console.log('Usage: anvil test "describe your test scenario"');
    console.log('\nExamples:');
    console.log('  anvil test "Test CRUD operations on /users endpoint"');
    console.log('  anvil test "Create a new order, then verify it appears in the list"');
    console.log('  anvil test "Test authentication with invalid credentials returns 401"');
    return;
  }

  console.log(`🧪 Test scenario: "${scenario}"\n`);

  const config = loadConfig();
  const adapter = createAdapter(config.llm.provider, config.llm.apiKey, config.llm.model);
  const agent = new AgentCore(adapter, {
    baseUrl: config.target.baseUrl,
    auth: config.target.auth,
    knowledgeDir: config.knowledge?.dir,
  });

  console.log(`🎯 Target: ${config.target.baseUrl}`);
  console.log(`🤖 LLM: ${config.llm.provider}/${config.llm.model}\n`);
  console.log('─'.repeat(60));

  try {
    const result = await agent.run(scenario);

    console.log('\n' + '─'.repeat(60));
    console.log('\n📋 Results:\n');

    if (result.results.length === 0) {
      console.log(result.message);
    } else {
      let passed = 0, failed = 0, warned = 0;
      for (const r of result.results) {
        const icon = r.status === 'pass' ? '✅' : r.status === 'fail' ? '❌' : '⚠️';
        console.log(`  ${icon} ${r.testName}${r.message ? ` — ${r.message}` : ''}`);
        if (r.status === 'pass') passed++;
        else if (r.status === 'fail') failed++;
        else warned++;
      }
      console.log(`\n  Total: ${result.results.length} | ✅ ${passed} | ❌ ${failed} | ⚠️ ${warned}`);
    }

    if (result.message) {
      console.log(`\n💬 ${result.message}`);
    }
  } catch (err: any) {
    console.error(`\n❌ Error: ${err.message}`);
    process.exit(1);
  }
}
