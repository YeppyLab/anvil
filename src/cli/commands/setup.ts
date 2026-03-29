import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { stringify as stringifyYaml } from 'yaml';
import { loadCredentials, saveCredentials, AnvilCredentials } from '../../lib/credentials';

function createPrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askMasked(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    process.stdout.write(question);

    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);

      const restoreTerminal = () => {
        if (stdin.isTTY && stdin.setRawMode) stdin.setRawMode(wasRaw ?? false);
      };
      process.once('SIGTERM', restoreTerminal);
      process.once('uncaughtException', (err) => { restoreTerminal(); throw err; });

      const promptLen = question.replace(/^\n+/, '').length;
      let input = '';

      const redraw = () => {
        // Move to start of input (after prompt), clear to end, redraw masked input
        process.stdout.write(`\r${question.replace(/^\n+/, '')}${'*'.repeat(input.length)}`);
        // Clear any leftover chars after current masked length
        process.stdout.write('\x1b[K');
      };

      const finish = () => {
        restoreTerminal();
        stdin.removeListener('data', onData);
        process.removeListener('SIGTERM', restoreTerminal);
      };

      const onData = (chunk: Buffer) => {
        const str = chunk.toString();
        for (const c of str) {
          if (c === '\n' || c === '\r') {
            finish();
            process.stdout.write('\n');
            resolve(input);
            return;
          } else if (c === '\u0003') {
            // Ctrl+C
            finish();
            process.exit(0);
          } else if (c === '\u007F' || c === '\b') {
            // Backspace — only delete input chars, never the prompt
            if (input.length > 0) {
              input = input.slice(0, -1);
              process.stdout.write('\b \b');
            }
          } else if (c.charCodeAt(0) >= 0x20 && !c.startsWith('\x1b')) {
            input += c;
            process.stdout.write('*');
          }
        }
      };
      stdin.on('data', onData);
    } else {
      // Non-TTY fallback (no masking)
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    }
  });
}

async function selectOption(rl: readline.Interface, question: string, options: string[]): Promise<number> {
  console.log(question);
  options.forEach((opt, i) => console.log(`  ${i + 1}. ${opt}`));

  while (true) {
    const answer = await ask(rl, `Choose (1-${options.length}): `);
    const num = parseInt(answer, 10);
    if (num >= 1 && num <= options.length) {
      return num - 1;
    }
    console.log(`  Please enter a number between 1 and ${options.length}.`);
  }
}

function getConfigFilePath(): string {
  return path.resolve(process.cwd(), 'anvil.config.yaml');
}

export async function runSetup(): Promise<void> {
  console.log('⚙️  Anvil Setup Wizard\n');

  // 1. Check for existing config or credentials → overwrite prompt
  const configPath = getConfigFilePath();
  const existingCredentials = loadCredentials();
  const existingConfig = fs.existsSync(configPath);

  if (existingCredentials || existingConfig) {
    const rlCheck = createPrompt();
    const answer = await ask(rlCheck, 'Existing configuration found. Overwrite? (y/N) ');
    rlCheck.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      process.stdin.pause();
      return;
    }
    console.log();
  }

  let rl = createPrompt();

  // Collected target config values
  let targetBaseUrl = '';
  let targetAuthType: 'bearer' | 'api-key' | 'none' = 'none';
  let targetToken = '';
  let targetApiKey = '';
  let targetHeaderName = 'X-API-Key';

  try {
    // 2. LLM provider
    const providerIdx = await selectOption(rl, 'Select LLM provider:', [
      'Anthropic (Claude)',
      'OpenAI (GPT)',
    ]);
    const provider: AnvilCredentials['provider'] = providerIdx === 0 ? 'anthropic' : 'openai';

    // 3. Auth mode (Anthropic only)
    let authMode: AnvilCredentials['authMode'] = 'api-key';
    if (provider === 'anthropic') {
      const authIdx = await selectOption(rl, '\nSelect authentication mode:', [
        'API Key',
        'OAuth Token (Claude Code)',
      ]);
      authMode = authIdx === 0 ? 'api-key' : 'oauth-token';
    }

    // 4. Close rl and resume stdin before masked input
    rl.close();
    process.stdin.resume();

    // 5. LLM credential input
    let credentials: AnvilCredentials;

    if (authMode === 'oauth-token') {
      const token = await askMasked('\nEnter OAuth token: ');
      if (!token) {
        console.log('\n❌ No token provided. Setup cancelled.');
        return;
      }
      credentials = { provider, authMode, oauthToken: token };
    } else {
      const keyLabel = provider === 'anthropic' ? 'Anthropic API key' : 'OpenAI API key';
      const key = await askMasked(`\nEnter ${keyLabel}: `);
      if (!key) {
        console.log('\n❌ No API key provided. Setup cancelled.');
        return;
      }
      credentials = { provider, authMode, apiKey: key };
    }

    // 6. Save credentials
    saveCredentials(credentials);
    console.log('\n✅ Credentials saved successfully.');

    // 7. Target API config — new rl for plain text questions
    rl = createPrompt();

    targetBaseUrl = await ask(rl, '\nTarget API base URL (e.g. https://api.example.com/v1): ');

    const authTypeIdx = await selectOption(rl, '\nTarget API authentication type:', [
      'Bearer token',
      'API Key (header)',
      'None',
    ]);
    targetAuthType = (['bearer', 'api-key', 'none'] as const)[authTypeIdx];

    // 8. Target auth credentials
    if (targetAuthType === 'bearer') {
      rl.close();
      process.stdin.resume();
      targetToken = await askMasked('\nEnter bearer token: ');
    } else if (targetAuthType === 'api-key') {
      rl.close();
      process.stdin.resume();
      targetApiKey = await askMasked('\nEnter API key: ');
      // Resume rl for the header name (plain text)
      rl = createPrompt();
      const headerInput = await ask(rl, '\nHeader name (default: X-API-Key): ');
      targetHeaderName = headerInput || 'X-API-Key';
      rl.close();
    } else {
      rl.close();
    }

    // 9. Build and write anvil.config.yaml
    const llmProvider = provider === 'anthropic' ? 'claude' : 'openai';
    const llmModel = llmProvider === 'claude' ? 'claude-sonnet-4-20250514' : 'gpt-4o';

    type TargetAuth = { type: string; token?: string; header?: string };
    let targetAuth: TargetAuth | undefined;
    if (targetAuthType === 'bearer') {
      targetAuth = { type: 'bearer', token: targetToken };
    } else if (targetAuthType === 'api-key') {
      targetAuth = { type: 'api-key', token: targetApiKey, header: targetHeaderName };
    }

    const config: Record<string, unknown> = {
      target: {
        baseUrl: targetBaseUrl,
        ...(targetAuth ? { auth: targetAuth } : {}),
      },
      llm: {
        provider: llmProvider,
        model: llmModel,
        apiKey: '',
      },
      knowledge: {
        dir: './src/knowledge',
      },
    };

    fs.writeFileSync(configPath, stringifyYaml(config), 'utf-8');

    // 10. Summary
    console.log('\n✅ anvil.config.yaml generated.\n');
    console.log('Configuration summary:');
    console.log(`  LLM provider : ${llmProvider}`);
    console.log(`  LLM model    : ${llmModel}`);
    console.log(`  LLM auth     : ${authMode}`);
    console.log(`  Target URL   : ${targetBaseUrl || '(none)'}`);
    console.log(`  Target auth  : ${targetAuthType}`);
    if (targetAuthType === 'api-key') {
      console.log(`  Header name  : ${targetHeaderName}`);
    }
    console.log('\n  Run `anvil test` to start testing!\n');
  } finally {
    rl.close();
    process.stdin.pause();
  }
}
