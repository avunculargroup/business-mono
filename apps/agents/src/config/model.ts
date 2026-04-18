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
 *
 * IMPORTANT: If using OpenRouter, set ANTHROPIC_MODEL to a non-Claude model name
 * (e.g., 'openai/gpt-4o-mini') to prevent the code from attempting direct Anthropic API calls.
 */
export function getModelConfig(): LanguageModelV2 {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openrouterApiKey = process.env['OPENROUTER_API_KEY'];
  const anthropicModel = process.env['ANTHROPIC_MODEL'];
  const openrouterModel = process.env['OPENROUTER_MODEL'];

  // Priority: OpenRouter (if configured) > Anthropic SDK (if API key available) > fail
  if (openrouterApiKey) {
    const model = openrouterModel ?? anthropicModel ?? DEFAULT_MODEL;
    const openai = createOpenAI({
      apiKey: openrouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openai(model);
  }

  if (anthropicApiKey) {
    const model = anthropicModel ?? DEFAULT_MODEL;
    const anthropic = createAnthropic({
      apiKey: anthropicApiKey,
    });
    const cleanModelName = model.replace(/^anthropic\//, '');
    return anthropic(cleanModelName);
  }

  throw new Error(
    'No AI provider configured. Set either ANTHROPIC_API_KEY (for Anthropic) or OPENROUTER_API_KEY (for OpenRouter).'
  );
}
