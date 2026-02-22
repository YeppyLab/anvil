import { LLMAdapter, LLMMessage } from '../adapters/interface';

export class AgentCore {
  private adapter: LLMAdapter;
  private history: LLMMessage[] = [];

  constructor(adapter: LLMAdapter) {
    this.adapter = adapter;
  }

  async run(userInput: string): Promise<string> {
    this.history.push({ role: 'user', content: userInput });
    const response = await this.adapter.chat(this.history);
    this.history.push({ role: 'assistant', content: response.content });
    return response.content;
  }
}
