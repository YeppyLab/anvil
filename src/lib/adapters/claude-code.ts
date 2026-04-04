import { execSync, execFileSync } from 'child_process';
import { LLMAdapter, LLMMessage, LLMResponse, ToolDefinition } from './interface';

export interface ClaudeCodeContext {
  baseUrl: string;
  auth?: { type: string; token?: string; header?: string };
}

const RESULTS_MARKER = 'ANVIL_RESULTS_JSON:';

export class ClaudeCodeAdapter implements LLMAdapter {
  private model: string;
  private context?: ClaudeCodeContext;

  constructor(model: string = 'sonnet', context?: ClaudeCodeContext) {
    // Verify claude CLI is available
    try {
      execSync('claude --version', { stdio: 'pipe' });
    } catch {
      throw new Error('Claude Code CLI not found. Install it: npm install -g @anthropic-ai/claude-code');
    }
    this.model = model;
    this.context = context;
  }

  setContext(context: ClaudeCodeContext): void {
    this.context = context;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    return this.chatWithTools(messages, []);
  }

  async chatWithTools(messages: LLMMessage[], _tools: ToolDefinition[]): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system');
    const userMsgs = messages.filter(m => m.role !== 'system');

    // Build system prompt with API context
    let systemPrompt = systemMsg?.content || '';
    if (this.context) {
      systemPrompt += `\n\n## API Target Configuration
- Base URL: ${this.context.baseUrl}
${this.context.auth ? `- Authentication: Use header "${this.context.auth.header || 'Authorization'}: ${this.context.auth.token || ''}"` : '- Authentication: None configured'}

## Instructions
- Use \`curl\` to make HTTP requests to the API
- Always include appropriate headers (Content-Type: application/json, auth headers)
- Test the scenarios described by the user
- After completing all tests, output your results in this EXACT format on its own line:
${RESULTS_MARKER}{"results":[{"testName":"...","status":"pass|fail|warn","message":"..."}],"steps":[],"message":"summary"}

The ANVIL_RESULTS_JSON line must be valid JSON after the marker. Include all test results.`;
    }

    // Build user prompt from conversation
    const userPrompt = userMsgs
      .map(m => `[${m.role}]: ${m.content}`)
      .join('\n\n');

    // Spawn claude -p
    const args = [
      '-p',
      '--output-format', 'json',
      '--model', this.model,
      '--dangerously-skip-permissions',
      '--allowedTools', 'Bash(curl:*)',
      userPrompt,
    ];

    if (systemPrompt) {
      args.splice(1, 0, '--system-prompt', systemPrompt);
    }

    let output: string;
    try {
      output = execFileSync('claude', args, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 5 * 60 * 1000, // 5 min
      });
    } catch (err: any) {
      throw new Error(`Claude Code CLI error: ${err.message}`);
    }

    // Parse JSON output
    let resultText: string;
    try {
      const parsed = JSON.parse(output);
      resultText = parsed.result || parsed.content || output;
    } catch {
      resultText = output;
    }

    // Extract parsed results
    const parsedResults = this.extractResults(resultText);

    // Strip the marker line from content
    const cleanContent = resultText
      .split('\n')
      .filter((line: string) => !line.includes(RESULTS_MARKER))
      .join('\n')
      .trim();

    return {
      content: cleanContent,
      parsedResults: parsedResults.length > 0 ? parsedResults : undefined,
    };
  }

  private extractResults(text: string): { testName: string; status: 'pass' | 'fail' | 'warn'; message?: string }[] {
    const idx = text.indexOf(RESULTS_MARKER);
    if (idx === -1) return [];

    const jsonStr = text.substring(idx + RESULTS_MARKER.length).split('\n')[0].trim();
    try {
      const data = JSON.parse(jsonStr);
      if (Array.isArray(data.results)) {
        return data.results.map((r: any) => ({
          testName: r.testName || 'Unknown',
          status: (['pass', 'fail', 'warn'].includes(r.status) ? r.status : 'warn') as 'pass' | 'fail' | 'warn',
          message: r.message,
        }));
      }
    } catch {
      // Failed to parse results
    }
    return [];
  }
}
