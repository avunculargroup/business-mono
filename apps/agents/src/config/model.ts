import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { DEFAULT_MODEL } from '@platform/shared';

/**
 * Returns an AI SDK model instance for Mastra agents.
 *
 * Priority:
 * 1. OpenRouter — set OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
 * 2. Anthropic   — set ANTHROPIC_API_KEY (default)
 *
 * OpenRouter is OpenAI-compatible, so we use createOpenAI with a custom
 * baseURL. Any model available on OpenRouter can be used, e.g.:
 *   OPENROUTER_MODEL=anthropic/claude-sonnet-4-5
 *   OPENROUTER_MODEL=openai/gpt-4o
 *   OPENROUTER_MODEL=google/gemini-2.0-flash-001
 */
export function getModelConfig() {
  if (process.env['OPENROUTER_API_KEY']) {
    const openai = createOpenAI({
      apiKey: process.env['OPENROUTER_API_KEY'],
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openai(process.env['OPENROUTER_MODEL'] ?? DEFAULT_MODEL);
  }

  const anthropic = createAnthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'],
  });
  // DEFAULT_MODEL uses OpenRouter format 'anthropic/claude-sonnet-4-5';
  // strip the prefix for the Anthropic SDK which expects 'claude-sonnet-4-5'.
  const modelName = (process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL).replace(/^anthropic\//, '');
  return anthropic(modelName);
}
