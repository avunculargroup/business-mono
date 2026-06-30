import { supabase } from '@platform/db';
import { embedVoiceText } from '@platform/voice';
import { BRAND_VOICE_SEED, VOICE_SNIPPET_SEEDS } from '../lib/voiceSeedData.js';

/**
 * Seed the brand_voice singleton and the company-canon voice_snippets from the
 * mapped content in lib/voiceSeedData.ts (sourced from docs/brand-voice.md).
 *
 * Idempotent:
 *   * brand_voice — updates the existing active row if one exists, else inserts.
 *     (The singleton is enforced at the application layer; we never create a
 *     second active row.)
 *   * voice_snippets — inserts each company-canon snippet only if no snippet
 *     with the same body already exists, so re-running won't duplicate.
 *
 * Snippet embeddings are generated via packages/voice (the embed-on-save path),
 * so seeded snippets are immediately retrievable.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, and the
 * Step 1/2 migrations applied. Run: `pnpm --filter @platform/agents seed:voice`.
 */

// brand_voice / voice_snippets are not in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

async function seedBrandVoice(): Promise<void> {
  const { data: existing, error: readErr } = await db
    .from('brand_voice')
    .select('id')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  if (readErr) throw new Error(`Reading brand_voice failed: ${readErr.message}`);

  const row = {
    profile: BRAND_VOICE_SEED.profile,
    mission_summary: BRAND_VOICE_SEED.mission_summary,
    bitcoin_capitalisation_rule: BRAND_VOICE_SEED.bitcoin_capitalisation_rule,
    content_policy: BRAND_VOICE_SEED.content_policy,
    version: BRAND_VOICE_SEED.version,
    is_active: true,
  };

  if (existing?.id) {
    const { error } = await db.from('brand_voice').update(row).eq('id', existing.id);
    if (error) throw new Error(`Updating brand_voice failed: ${error.message}`);
    console.log(`[seed:voice] Updated brand_voice ${existing.id} (v${row.version}).`);
  } else {
    const { error } = await db.from('brand_voice').insert(row);
    if (error) throw new Error(`Inserting brand_voice failed: ${error.message}`);
    console.log(`[seed:voice] Inserted brand_voice singleton (v${row.version}).`);
  }
}

async function seedSnippets(): Promise<void> {
  let inserted = 0;
  for (const snippet of VOICE_SNIPPET_SEEDS) {
    const { data: dupe, error: dupeErr } = await db
      .from('voice_snippets')
      .select('id')
      .is('social_account_id', null)
      .eq('body', snippet.body)
      .limit(1)
      .maybeSingle();
    if (dupeErr) throw new Error(`Checking voice_snippets failed: ${dupeErr.message}`);
    if (dupe?.id) continue;

    const embedding = await embedVoiceText(snippet.body);
    const { error } = await db.from('voice_snippets').insert({
      social_account_id: null,
      snippet_type: snippet.snippet_type,
      body: snippet.body,
      curator_note: snippet.curator_note,
      platform: snippet.platform,
      topic_tags: snippet.topic_tags,
      is_starred: snippet.is_starred,
      source: 'manual',
      embedding,
    });
    if (error) throw new Error(`Inserting voice_snippet failed: ${error.message}`);
    inserted += 1;
  }
  console.log(
    `[seed:voice] Snippets: ${inserted} inserted, ${VOICE_SNIPPET_SEEDS.length - inserted} already present.`,
  );
}

async function main(): Promise<void> {
  await seedBrandVoice();
  await seedSnippets();
  console.log('[seed:voice] Done.');
}

main().catch((err) => {
  console.error('[seed:voice] Failed:', err);
  process.exit(1);
});
