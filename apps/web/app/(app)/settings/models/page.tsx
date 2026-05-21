import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import {
  MODEL_SCOPES,
  POPULAR_MODELS,
  WORKFLOW_LABELS,
  DEFAULT_MODEL,
  type ModelScope,
} from '@platform/shared';
import { ModelSettingsClient, type ScopeRow } from './ModelSettingsClient';

export default async function ModelSettingsPage() {
  const supabase = await createClient();

  // model_configs isn't in the generated Database types yet (regenerate after
  // the migration applies). Until then, cast at the boundary and keep the
  // shape narrow.
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => Promise<{
        data: Array<{ scope_key: string; model_id: string; updated_at: string }> | null;
        error: { message: string } | null;
      }>;
    };
  })
    .from('model_configs')
    .select('scope_key, model_id, updated_at');

  const configByKey = new Map<string, { model_id: string; updated_at: string }>();
  if (!error && data) {
    for (const row of data) {
      configByKey.set(row.scope_key, { model_id: row.model_id, updated_at: row.updated_at });
    }
  }

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
        workflowLabels={WORKFLOW_LABELS}
        loadError={error?.message ?? null}
      />
    </>
  );
}
