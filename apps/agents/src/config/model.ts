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
  const modelName = process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL;

  // Use Anthropic SDK directly for Claude models (preferred, avoids OpenRouter routing issues)
  if (modelName.startsWith('anthropic/') || modelName.startsWith('claude-')) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) {
      if (process.env['OPENROUTER_API_KEY']) {
        throw new Error(
          'ANTHROPIC_API_KEY is missing but required for Claude models. ' +
            'To use Claude via OpenRouter, set OPENROUTER_MODEL=anthropic/claude-sonnet-4-5 instead of ANTHROPIC_MODEL.'
        );
      }
      throw new Error('ANTHROPIC_API_KEY is required for Claude models.');
    }
    const anthropic = createAnthropic({
      apiKey,
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
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    throw new Error(
      'No AI provider configured. Set either ANTHROPIC_API_KEY (for Anthropic) or OPENROUTER_API_KEY (for OpenRouter).'
    );
  }
  const anthropic = createAnthropic({
    apiKey,
  });
  const cleanModelName = modelName.replace(/^anthropic\//, '');
  return anthropic(cleanModelName);
}
