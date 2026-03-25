import { parseArgs } from './commands/parse-args';

async function main() {
  console.log('🔨 Anvil — AI-powered API testing\n');

  const command = process.argv[2];

  switch (command) {
    case 'import':
      const { importSpec } = await import('./commands/import');
      await importSpec(process.argv.slice(3));
      break;
    case 'setup':
      const { runSetup } = await import('./commands/setup');
      await runSetup();
      break;
    case 'test':
      const { runTest } = await import('./commands/test');
      await runTest(process.argv.slice(3));
      break;
    case 'report':
      const { showReport } = await import('./commands/report');
      await showReport(process.argv.slice(3));
      break;
    default:
      console.log('Usage: anvil <command>\n');
      console.log('Commands:');
      console.log('  setup    Configure LLM provider and credentials');
      console.log('  import   Import Postman collection or OpenAPI spec');
      console.log('  test     Run tests from natural language description');
      console.log('  report   View or export test results');
      break;
  }
}

main().catch(console.error);
