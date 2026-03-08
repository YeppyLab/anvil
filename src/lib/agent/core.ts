import { LLMAdapter, LLMMessage } from '../adapters/interface';
import { TOOLS } from '../tools/definitions';
import { handleToolCall, ToolContext } from '../tools/handlers';
import { StepCallback, StepEntry } from '../step-log';
import { SYSTEM_PROMPT } from './prompts';
import { buildKnowledgeSummary } from './knowledge-injector';

export interface AgentConfig {
  baseUrl: string;
  auth?: { type: string; token?: string; header?: string };
  knowledgeDir?: string;
  onStep?: StepCallback;
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
      lastRequest: null,
      variables: {},
      results: [],
      stepCount: 0,
      steps: [],
      onStep: config.onStep,
    };
    this.history.push({ role: 'system', content: this.buildSystemPrompt() });
  }

  get steps(): StepEntry[] {
    return this.toolContext.steps;
  }

  private buildSystemPrompt(): string {
    let prompt = SYSTEM_PROMPT;

    // Auto-inject API knowledge if available
    if (this.toolContext.knowledgeDir) {
      const summary = buildKnowledgeSummary(this.toolContext.knowledgeDir);
      if (summary) {
        prompt += '\n\n---\n\n# API Knowledge Base (Auto-injected)\n\n' + summary;
        prompt += '\n\nThe above endpoints are available in the target API. Use `read_knowledge` only if you need detailed schema information for request/response bodies.';
      }
    }

    return prompt;
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
          steps: this.toolContext.steps,
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
      steps: this.toolContext.steps,
    };
  }
}

export interface AgentRunResult {
  message: string;
  results: TestResult[];
  steps: StepEntry[];
}

export interface TestResult {
  testName: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}
