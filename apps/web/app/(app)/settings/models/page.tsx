import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import {
  MODEL_SCOPES,
  POPULAR_MODELS,
  WORKFLOW_LABELS,
  DEFAULT_MODEL,
  type ModelScope,
} from '@platform/shared';
import { ModelSettingsClient, type ScopeRow, type CatalogModel } from './ModelSettingsClient';

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

async function fetchOpenRouterCatalog(): Promise<{ models: CatalogModel[]; error: string | null }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      signal: controller.signal,
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return { models: [], error: `OpenRouter responded ${res.status}` };
    }
    const json = (await res.json()) as OpenRouterModelsResponse;
    const data = json.data ?? [];
    const models: CatalogModel[] = data
      .filter((m) => typeof m.id === 'string' && m.id.length > 0)
      .map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        contextLength: typeof m.context_length === 'number' ? m.context_length : null,
      }));
    return { models, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    return { models: [], error: `Couldn't reach OpenRouter (${message})` };
  } finally {
    clearTimeout(timeout);
  }
}

export default async function ModelSettingsPage() {
  const supabase = await createClient();

  // model_configs isn't in the generated Database types yet (regenerate after
  // the migration applies). Until then, cast at the boundary and keep the
  // shape narrow.
  const [{ data, error }, catalog] = await Promise.all([
    (supabase as unknown as {
      from: (t: string) => {
        select: (cols: string) => Promise<{
          data: Array<{ scope_key: string; model_id: string; updated_at: string }> | null;
          error: { message: string } | null;
        }>;
      };
    })
      .from('model_configs')
      .select('scope_key, model_id, updated_at'),
    fetchOpenRouterCatalog(),
  ]);

  const configByKey = new Map<string, { model_id: string; updated_at: string }>();
  if (!error && data) {
    for (const row of data) {
      configByKey.set(row.scope_key, { model_id: row.model_id, updated_at: row.updated_at });
    }
  }

  // When the OpenRouter fetch fails, fall back to the curated list so the UI
  // still has something to render.
  const catalogModels: CatalogModel[] =
    catalog.models.length > 0
      ? catalog.models
      : POPULAR_MODELS.map((m) => ({ id: m.id, name: m.label, contextLength: null }));

  const rows: ScopeRow[] = MODEL_SCOPES.map((scope: ModelScope) => {
    const current = configByKey.get(scope.key);
    return {
      key: scope.key,
      type: scope.type,
      label: scope.label,
      description: scope.description,
      workflow: scope.workflow ?? null,
      fallbackAgent: scope.fallbackAgent ?? null,
      modelId: current?.model_id ?? null,
      updatedAt: current?.updated_at ?? null,
    };
  });

  return (
    <>
      <PageHeader title="Models" />
      <ModelSettingsClient
        rows={rows}
        defaultModel={DEFAULT_MODEL}
        popularModels={[...POPULAR_MODELS]}
        catalogModels={catalogModels}
        workflowLabels={WORKFLOW_LABELS}
        loadError={error?.message ?? null}
        catalogError={catalog.error}
      />
    </>
  );
}
