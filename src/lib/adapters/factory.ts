import { LLMAdapter } from './interface';
import { OpenAIAdapter } from './openai';
import { ClaudeAdapter } from './claude';
import { ClaudeCodeAdapter, ClaudeCodeContext } from './claude-code';

export function createAdapter(
  provider: string,
  apiKey: string,
  model: string,
  authMode?: 'api-key' | 'oauth-token',
  claudeCodeContext?: ClaudeCodeContext,
): LLMAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAIAdapter(apiKey, model);
    case 'claude':
      if (authMode === 'oauth-token') {
        return new ClaudeCodeAdapter(model, claudeCodeContext);
      }
      return new ClaudeAdapter(apiKey, model, authMode);
    case 'gemini':
      throw new Error('Gemini adapter not yet implemented');
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}
