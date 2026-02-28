import { LLMAdapter, LLMMessage, ToolCall } from '../adapters/interface';
import { TOOLS } from '../tools/definitions';
import { handleToolCall, ToolContext } from '../tools/handlers';
import { SYSTEM_PROMPT } from './prompts';

export interface AgentConfig {
  baseUrl: string;
  auth?: { type: string; token?: string; header?: string };
  knowledgeDir?: string;
}

export class AgentCore {
  private adapter: LLMAdapter;
  private history: LLMMessage[] = [];
  private toolContext: ToolContext;
  private maxIterations = 20;

  constructor(adapter: LLMAdapter, config: AgentConfig) {
    this.adapter = adapter;
    this.toolContext = {
      baseUrl: config.baseUrl,
      auth: config.auth,
      knowledgeDir: config.knowledgeDir,
      lastResponse: null,
      variables: {},
      results: [],
    };
    this.history.push({ role: 'system', content: this.buildSystemPrompt() });
  }

  private buildSystemPrompt(): string {
    return SYSTEM_PROMPT;
  }

  async run(userInput: string): Promise<AgentRunResult> {
    this.history.push({ role: 'user', content: userInput });

    for (let i = 0; i < this.maxIterations; i++) {
      const response = await this.adapter.chatWithTools(this.history, TOOLS);

      if (!response.toolCalls?.length) {
        this.history.push({ role: 'assistant', content: response.content });
        return {
          message: response.content,
          results: this.toolContext.results,
        };
      }

      // Process tool calls
      this.history.push({
        role: 'assistant',
        content: response.content || '',
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        const result = await handleToolCall(call.name, call.arguments, this.toolContext);
        this.history.push({
          role: 'tool',
          content: JSON.stringify(result),
          toolCallId: call.id,
        });
      }
    }

    return {
      message: '⚠️ Reached maximum iterations. Test run may be incomplete.',
      results: this.toolContext.results,
    };
  }
}

export interface AgentRunResult {
  message: string;
  results: TestResult[];
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}
