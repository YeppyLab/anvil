import * as readline from 'readline';
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

      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          restoreTerminal();
          stdin.removeListener('data', onData);
          process.removeListener('SIGTERM', restoreTerminal);
          process.stdout.write('\n');
          resolve(input);
        } else if (c === '\u0003') {
          // Ctrl+C
          restoreTerminal();
          stdin.removeListener('data', onData);
          process.removeListener('SIGTERM', restoreTerminal);
          process.exit(0);
        } else if (c === '\u007F' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (c.charCodeAt(0) >= 0x20 && !c.startsWith('\x1b')) {
          input += c;
          process.stdout.write('*');
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

export async function runSetup(): Promise<void> {
  console.log('⚙️  Anvil Setup Wizard\n');

  const existing = loadCredentials();
  if (existing) {
    console.log(`Current config: provider=${existing.provider}, auth=${existing.authMode}`);
    console.log('Re-running setup will overwrite existing credentials.\n');
  }

  const rl = createPrompt();

  try {
    // 1. Provider
    const providerIdx = await selectOption(rl, 'Select LLM provider:', [
      'Anthropic (Claude)',
      'OpenAI (GPT)',
    ]);
    const provider: AnvilCredentials['provider'] = providerIdx === 0 ? 'anthropic' : 'openai';

    // 2. Auth mode
    let authMode: AnvilCredentials['authMode'] = 'api-key';
    if (provider === 'anthropic') {
      const authIdx = await selectOption(rl, '\nSelect authentication mode:', [
        'API Key',
        'OAuth Token (Claude Code)',
      ]);
      authMode = authIdx === 0 ? 'api-key' : 'oauth-token';
    }

    // 3. Credential input
    // Close rl and resume stdin (rl.close() pauses it)
    rl.close();
    process.stdin.resume();

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

    // 4. Save
    saveCredentials(credentials);
    console.log('\n✅ Credentials saved successfully.');
    console.log('   Run `anvil test` to start testing!\n');
  } finally {
    rl.close();
  }
}
