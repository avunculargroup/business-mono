'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { MODEL_SCOPES, type ModelScopeType } from '@platform/shared';

const REVALIDATE = '/settings/models';

const VALID_SCOPE_KEYS = new Set(MODEL_SCOPES.map((s) => s.key));
const SCOPE_TYPE_BY_KEY = new Map<string, ModelScopeType>(
  MODEL_SCOPES.map((s) => [s.key, s.type]),
);

function validate(scopeKey: string, modelId: string): { error: string } | null {
  if (!VALID_SCOPE_KEYS.has(scopeKey)) {
    return { error: `Unknown scope: ${scopeKey}` };
  }
  const trimmed = modelId.trim();
  if (!trimmed) return { error: 'Model id cannot be empty' };
  // OpenRouter models look like `vendor/model` or sometimes `vendor/model:tag`.
  if (trimmed.length > 200) return { error: 'Model id too long' };
  return null;
}

export async function upsertModelConfig(scopeKey: string, modelId: string) {
  const err = validate(scopeKey, modelId);
  if (err) return err;

  const scopeType = SCOPE_TYPE_BY_KEY.get(scopeKey);
  if (!scopeType) return { error: `Unknown scope: ${scopeKey}` };

  const supabase = await createClient();
  // Casts: model_configs isn't in the generated Database types until
  // `pnpm --filter @platform/db generate-types` is re-run after the
  // migration is applied. Once that happens these can be removed.
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<{ error: { message: string } | null }>;
    };
  })
    .from('model_configs')
    .upsert(
      {
        scope_key: scopeKey,
        scope_type: scopeType,
        model_id: modelId.trim(),
      },
      { onConflict: 'scope_key' },
    );

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function resetModelConfig(scopeKey: string) {
  if (!VALID_SCOPE_KEYS.has(scopeKey)) {
    return { error: `Unknown scope: ${scopeKey}` };
  }

  const supabase = await createClient();
  const { error } = await (supabase as unknown as {
    from: (t: string) => {
      delete: () => { eq: (col: string, val: string) => Promise<{ error: { message: string } | null }> };
    };
  })
    .from('model_configs')
    .delete()
    .eq('scope_key', scopeKey);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}
