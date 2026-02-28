import axios from 'axios';
import { LLMAdapter, LLMMessage, LLMResponse, ToolDefinition, ToolCall } from './interface';

export class OpenAIAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    return this.chatWithTools(messages, []);
  }

  async chatWithTools(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const body: any = {
      model: this.model,
      messages: messages.map(m => this.formatMessage(m)),
    };

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
    }

    const res = await axios.post('https://api.openai.com/v1/chat/completions', body, {
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
    });

    const choice = res.data.choices[0];
    const msg = choice.message;

    const toolCalls: ToolCall[] | undefined = msg.tool_calls?.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return { content: msg.content || '', toolCalls };
  }

  private formatMessage(msg: LLMMessage): any {
    if (msg.role === 'tool') {
      return { role: 'tool', content: msg.content, tool_call_id: msg.toolCallId };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      return {
        role: 'assistant',
        content: msg.content || null,
        tool_calls: msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      };
    }
    return { role: msg.role, content: msg.content };
  }
}
