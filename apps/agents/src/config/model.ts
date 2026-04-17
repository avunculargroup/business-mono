import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { DEFAULT_MODEL } from '@platform/shared';

/**
 * Returns an AI SDK model instance for Mastra agents.
 *
 * Priority:
 * 1. Claude models → use Anthropic SDK directly (avoids routing issues with OpenRouter responses API)
 * 2. Non-Claude models → use OpenRouter with OpenAI-compatible client
 * 3. Fallback → Anthropic SDK
 *
 * Supported model names: 'anthropic/claude-X', 'claude-X', or OpenRouter format
 */
export function getModelConfig(): LanguageModelV2 {
  const modelName = process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL;

  // Use Anthropic SDK directly for Claude models (preferred, avoids OpenRouter routing issues)
  if (modelName.startsWith('anthropic/') || modelName.startsWith('claude-')) {
    const anthropic = createAnthropic({
      apiKey: process.env['ANTHROPIC_API_KEY'],
    });
    const cleanModelName = modelName.replace(/^anthropic\//, '');
    return anthropic(cleanModelName);
  }

  // For non-Claude models via OpenRouter
  if (process.env['OPENROUTER_API_KEY']) {
    const openai = createOpenAI({
      apiKey: process.env['OPENROUTER_API_KEY'],
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openai(process.env['OPENROUTER_MODEL'] ?? modelName);
  }

  // Fallback to Anthropic SDK
  const anthropic = createAnthropic({
    apiKey: process.env['ANTHROPIC_API_KEY'],
  });
  const cleanModelName = modelName.replace(/^anthropic\//, '');
  return anthropic(cleanModelName);
}
