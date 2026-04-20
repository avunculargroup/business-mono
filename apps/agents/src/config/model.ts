import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { DEFAULT_MODEL } from '@platform/shared';

/**
 * Returns an AI SDK model instance for Mastra agents.
 *
 * Priority:
 * 1. OpenRouter (if OPENROUTER_API_KEY set) → OpenAI-compatible chat completions
 *    endpoint. Must use `openai.chat()` rather than `openai()` because
 *    `@ai-sdk/openai` v2 defaults to the Responses API (`/v1/responses`), which
 *    OpenRouter rejects with `invalid_prompt` for the message shapes the AI SDK
 *    emits (reasoning blocks, tool calls, etc.).
 * 2. Anthropic SDK (if only ANTHROPIC_API_KEY is set) → direct Anthropic API.
 * 3. Fail fast.
 */
export function getModelConfig(): LanguageModelV2 {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openrouterApiKey = process.env['OPENROUTER_API_KEY'];
  const anthropicModel = process.env['ANTHROPIC_MODEL'];
  const openrouterModel = process.env['OPENROUTER_MODEL'];

  if (openrouterApiKey) {
    const model = openrouterModel ?? anthropicModel ?? DEFAULT_MODEL;
    const openai = createOpenAI({
      apiKey: openrouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openai.chat(model);
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
