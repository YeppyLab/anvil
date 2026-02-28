import axios from 'axios';
import { LLMAdapter, LLMMessage, LLMResponse, ToolDefinition, ToolCall } from './interface';

export class ClaudeAdapter implements LLMAdapter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'claude-sonnet-4-20250514') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: LLMMessage[]): Promise<LLMResponse> {
    return this.chatWithTools(messages, []);
  }

  async chatWithTools(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse> {
    const systemMsg = messages.find(m => m.role === 'system');
    const nonSystemMsgs = messages.filter(m => m.role !== 'system');

    const body: any = {
      model: this.model,
      max_tokens: 4096,
      messages: nonSystemMsgs.map(m => this.formatMessage(m)),
    };

    if (systemMsg) body.system = systemMsg.content;

    if (tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const res = await axios.post('https://api.anthropic.com/v1/messages', body, {
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
    });

    const content = res.data.content;
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
      }
    }

    return { content: text, toolCalls: toolCalls.length ? toolCalls : undefined };
  }

  private formatMessage(msg: LLMMessage): any {
    if (msg.role === 'tool') {
      return {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.toolCallId, content: msg.content }],
      };
    }
    if (msg.role === 'assistant' && msg.toolCalls?.length) {
      const blocks: any[] = [];
      if (msg.content) blocks.push({ type: 'text', text: msg.content });
      for (const tc of msg.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
      }
      return { role: 'assistant', content: blocks };
    }
    return { role: msg.role, content: msg.content };
  }
}
