export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  content: string;
  toolCalls?: ToolCall[];
  parsedResults?: { testName: string; status: 'pass' | 'fail' | 'warn'; message?: string }[];
}

export interface LLMAdapter {
  chat(messages: LLMMessage[]): Promise<LLMResponse>;
  chatWithTools(messages: LLMMessage[], tools: ToolDefinition[]): Promise<LLMResponse>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
