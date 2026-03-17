import { DEFAULT_MODEL } from '@platform/shared';

type ModelConfig = {
  provider: 'ANTHROPIC' | 'OPEN_AI';
  name: string;
  apiKey?: string;
  baseURL?: string;
};

/**
 * Returns the model config for Mastra agents.
 *
 * Priority:
 * 1. OpenRouter — set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
 * 2. Anthropic   — set ANTHROPIC_API_KEY (default)
 *
 * OpenRouter is OpenAI-compatible, so we use the OPEN_AI provider with a
 * custom baseURL. Any model available on OpenRouter can be used, e.g.:
 *   OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
 *   OPENROUTER_MODEL=openai/gpt-4o
 *   OPENROUTER_MODEL=google/gemini-2.0-flash-001
 */
export function getModelConfig(): ModelConfig {
  if (process.env['OPENROUTER_API_KEY']) {
    return {
      provider: 'OPEN_AI',
      name: process.env['OPENROUTER_MODEL'] ?? DEFAULT_MODEL,
      apiKey: process.env['OPENROUTER_API_KEY'],
      baseURL: 'https://openrouter.ai/api/v1',
    };
  }

  return {
    provider: 'ANTHROPIC',
    name: process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL,
  };
}
