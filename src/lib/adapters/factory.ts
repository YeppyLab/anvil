import { LLMAdapter } from './interface';
import { OpenAIAdapter } from './openai';
import { ClaudeAdapter } from './claude';

export function createAdapter(provider: string, apiKey: string, model: string): LLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(apiKey, model);
    case 'claude':
      return new ClaudeAdapter(apiKey, model);
    case 'gemini':
      throw new Error('Gemini adapter not yet implemented');
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
