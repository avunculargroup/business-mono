import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { RequestContext } from '@mastra/core/request-context';
import { DEFAULT_MODEL, MODEL_SCOPES } from '@platform/shared';
import { supabase } from '@platform/db';

const STEP_SCOPE_KEY = 'stepScope';

const fallbackAgentByStepKey = new Map<string, string>(
  MODEL_SCOPES
    .filter((s) => s.type === 'workflow_step' && s.fallbackAgent)
    .map((s) => [s.key, s.fallbackAgent as string]),
);

const ENV_DEFAULT_MODEL_ID =
  process.env['OPENROUTER_MODEL'] ?? process.env['ANTHROPIC_MODEL'] ?? DEFAULT_MODEL;

/**
 * Returns an AI SDK model instance built from a model id string.
 *
 * Priority:
 * 1. OpenRouter (if OPENROUTER_API_KEY set) → OpenAI-compatible chat completions
 *    endpoint. Must use `openai.chat()` rather than `openai()` because
 *    `@ai-sdk/openai` v2 defaults to the Responses API, which OpenRouter rejects.
 * 2. Anthropic SDK (if only ANTHROPIC_API_KEY is set) → direct Anthropic API.
 * 3. Fail fast.
 */
function buildModel(modelId: string): LanguageModelV2 {
  const anthropicApiKey = process.env['ANTHROPIC_API_KEY'];
  const openrouterApiKey = process.env['OPENROUTER_API_KEY'];

  if (openrouterApiKey) {
    const openai = createOpenAI({
      apiKey: openrouterApiKey,
      baseURL: 'https://openrouter.ai/api/v1',
    });
    return openai.chat(modelId);
  }

  if (anthropicApiKey) {
    const cleanModelName = modelId.replace(/^anthropic\//, '');
    const anthropic = createAnthropic({ apiKey: anthropicApiKey });
    return anthropic(cleanModelName);
  }

  throw new Error(
    'No AI provider configured. Set either ANTHROPIC_API_KEY (for Anthropic) or OPENROUTER_API_KEY (for OpenRouter).',
  );
}

/**
 * Returns an AI SDK model instance using env-var configuration only. Kept for
 * back-compat with any caller that doesn't have a scope (and as the absolute
 * fallback inside the dynamic resolver below).
 */
export function getModelConfig(): LanguageModelV2 {
  return buildModel(ENV_DEFAULT_MODEL_ID);
}

// ── DB-backed overrides ──────────────────────────────────────────────────────
//
// Each agent invocation calls into the dynamic `model` function below. We
// don't want a `model_configs` SELECT on every generate() call, so the table
// is loaded once and cached for CACHE_TTL_MS. The settings UI can invalidate
// it explicitly via the agent server's /admin/refresh-model-configs route if
// you want changes to take effect immediately.

const CACHE_TTL_MS = 30_000;

interface ConfigsCache {
  byKey: Map<string, string>;
  loadedAt: number;
}

let configsCache: ConfigsCache | null = null;
let inFlightLoad: Promise<Map<string, string>> | null = null;

// model_configs isn't in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs after the migration is
// applied. Cast at the boundary; the row shape is asserted explicitly.
type ModelConfigsClient = {
  from: (table: 'model_configs') => {
    select: (cols: string) => Promise<{
      data: Array<{ scope_key: string; model_id: string }> | null;
      error: { message: string } | null;
    }>;
  };
};

async function loadConfigs(): Promise<Map<string, string>> {
  const byKey = new Map<string, string>();
  try {
    const { data, error } = await (supabase as unknown as ModelConfigsClient)
      .from('model_configs')
      .select('scope_key, model_id');
    if (error) {
      console.warn('[model.ts] model_configs select failed, using defaults:', error.message);
    } else if (data) {
      for (const row of data) {
        byKey.set(row.scope_key, row.model_id);
      }
    }
  } catch (err) {
    console.warn('[model.ts] model_configs load threw, using defaults:', err);
  }
  return byKey;
}

async function getConfigs(): Promise<Map<string, string>> {
  if (configsCache && Date.now() - configsCache.loadedAt < CACHE_TTL_MS) {
    return configsCache.byKey;
  }
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = loadConfigs().then((byKey) => {
    configsCache = { byKey, loadedAt: Date.now() };
    inFlightLoad = null;
    return byKey;
  });
  return inFlightLoad;
}

/** Forces the next resolveModel() call to re-read model_configs from the DB. */
export function invalidateModelConfigCache(): void {
  configsCache = null;
}

/**
 * Resolve the model for a scope. Most-specific override wins, then any of
 * the fallback keys in order, then the env default.
 */
async function resolveModel(
  primaryScopeKey: string,
  fallbackKeys: readonly string[] = [],
): Promise<LanguageModelV2> {
  const configs = await getConfigs();
  const lookup = (key: string): string | undefined => configs.get(key);

  let modelId = lookup(primaryScopeKey);
  if (!modelId) {
    for (const key of fallbackKeys) {
      modelId = lookup(key);
      if (modelId) break;
    }
  }
  return buildModel(modelId ?? ENV_DEFAULT_MODEL_ID);
}

/**
 * Builds the dynamic `model` callback for a Mastra Agent.
 *
 * Resolution order on each invocation:
 *   1. Per-step override: if the caller passed a `RequestContext` with a
 *      `stepScope` value, that scope wins (this is how workflow steps
 *      override their owning agent's model).
 *   2. The agent's own scope key.
 *   3. The env-var default.
 */
export function dynamicModelFor(
  agentScopeKey: string,
): (args: { requestContext: RequestContext }) => Promise<LanguageModelV2> {
  return async ({ requestContext }) => {
    const stepScope = requestContext.get(STEP_SCOPE_KEY) as string | undefined;
    if (stepScope) {
      const stepFallback = fallbackAgentByStepKey.get(stepScope);
      const fallbacks = stepFallback && stepFallback !== agentScopeKey
        ? [stepFallback, agentScopeKey]
        : [agentScopeKey];
      return resolveModel(stepScope, fallbacks);
    }
    return resolveModel(agentScopeKey);
  };
}

/**
 * Constructs a `RequestContext` that tells `dynamicModelFor` which workflow
 * step is running. Use this when a workflow step calls into an agent's
 * `generate()` and you want the step-level override (if any) to win:
 *
 *   const requestContext = stepRequestContext('recorder.identify_speakers');
 *   await roger.generate(messages, { requestContext });
 */
export function stepRequestContext(stepScopeKey: string): RequestContext {
  const ctx = new RequestContext();
  ctx.set(STEP_SCOPE_KEY, stepScopeKey);
  return ctx;
}
