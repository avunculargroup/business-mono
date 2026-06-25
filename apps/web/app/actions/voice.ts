'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { cleanAccountProfile } from '@/components/brand/accountVoice';

// Brand Hub voice editing. Writes the brand_voice singleton and voice_snippets
// via the cookie-authed SSR client (RLS: authenticated). brand_voice /
// voice_snippets are not in the generated Database types yet, so we cast the
// query builder at the boundary — same pattern as other not-yet-typed tables.

const REVALIDATE = '/brand';

const profileSchema = z.object({
  persona: z.string().trim().optional().default(''),
  tone_attributes: z.array(z.string()).default([]),
  vocabulary_do: z.array(z.string()).default([]),
  vocabulary_avoid: z.array(z.string()).default([]),
  signature_devices: z.array(z.string()).default([]),
  format_notes: z.string().trim().optional().default(''),
});

const brandVoiceSchema = z.object({
  profile: z.string(), // JSON-encoded profile object
  mission_summary: z.string().trim().optional().default(''),
  bitcoin_capitalisation_rule: z.string().trim().optional().default(''),
});

/** Bump the minor component of a `major.minor` version string (1.2 -> 1.3). */
function bumpVersion(current: string | null | undefined): string {
  const match = /^(\d+)\.(\d+)$/.exec((current ?? '').trim());
  if (!match) return '1.0';
  return `${match[1]}.${Number(match[2]) + 1}`;
}

export async function updateBrandVoice(formData: FormData) {
  const parsed = brandVoiceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let profile;
  try {
    profile = profileSchema.parse(JSON.parse(parsed.data.profile));
  } catch {
    return { error: 'Voice profile is malformed' };
  }
  if (!profile.persona) return { error: 'Persona is required' };
  if (profile.tone_attributes.length === 0) return { error: 'Add at least one tone attribute' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: existing } = await db
    .from('brand_voice')
    .select('id, version')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const row = {
    profile,
    mission_summary: parsed.data.mission_summary || null,
    bitcoin_capitalisation_rule: parsed.data.bitcoin_capitalisation_rule || null,
    version: bumpVersion(existing?.version),
    is_active: true,
    updated_by: user?.id ?? null,
  };

  const { error } = existing?.id
    ? await db.from('brand_voice').update(row).eq('id', existing.id)
    : await db.from('brand_voice').insert(row);
  if (error) return { error: error.message };

  revalidatePath(REVALIDATE);
  return { success: true, version: row.version };
}

const accountVoiceSchema = z.object({
  id: z.string().uuid(),
  display_name: z.string().trim().min(1, 'Display name is required'),
  handle: z.string().trim().optional().default(''),
  profile_url: z.string().trim().optional().default(''),
  profile: z.string(), // JSON-encoded VoiceProfile (overrides only)
});

const accountProfileSchema = profileSchema.partial();

/**
 * Update a founder/company account voice. Stores only the overridden fields on
 * `social_accounts.voice_profile` (inherited fields stay empty so future canon
 * edits keep flowing through) plus the editable account identity. The company
 * canon is loaded to strip company-banned avoid words from the stored profile.
 */
export async function updateAccountVoice(formData: FormData) {
  const parsed = accountVoiceSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { error: parsed.error.errors[0].message };

  let rawProfile;
  try {
    rawProfile = accountProfileSchema.parse(JSON.parse(parsed.data.profile));
  } catch {
    return { error: 'Voice profile is malformed' };
  }

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: brand } = await db
    .from('brand_voice')
    .select('profile')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  const voice_profile = cleanAccountProfile(rawProfile, brand?.profile ?? {});

  const { error } = await db
    .from('social_accounts')
    .update({
      display_name: parsed.data.display_name,
      handle: parsed.data.handle || null,
      profile_url: parsed.data.profile_url || null,
      voice_profile,
    })
    .eq('id', parsed.data.id);
  if (error) return { error: error.message };

  revalidatePath(REVALIDATE);
  return { success: true };
}

const snippetSchema = z.object({
  id: z.string().uuid().optional(),
  snippet_type: z.enum(['phrase', 'opener', 'closer', 'transition', 'paragraph', 'full_post', 'cta']),
  body: z.string().trim().min(1, 'Snippet body is required'),
  curator_note: z.string().trim().min(1, 'A curator note is required — explain why it demonstrates the voice'),
  platform: z.enum(['linkedin', 'twitter_x']).nullable().optional(),
  topic_tags: z.array(z.string()).default([]),
});

function parseSnippet(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  return snippetSchema.safeParse({
    ...raw,
    platform: raw.platform === '' || raw.platform === undefined ? null : raw.platform,
    topic_tags: raw.topic_tags ? JSON.parse(String(raw.topic_tags)) : [],
  });
}

export async function saveVoiceSnippet(formData: FormData) {
  const parsed = parseSnippet(formData);
  if (!parsed.success) return { error: parsed.error.errors[0].message };
  const s = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  // Company-canon snippet (social_account_id = NULL). Embedding is generated by
  // the agents layer (the OpenAI key stays server-side there); a snippet saved
  // here is immediately listed/editable and becomes retrievable once embedded.
  const fields = {
    snippet_type: s.snippet_type,
    body: s.body,
    curator_note: s.curator_note,
    platform: s.platform ?? null,
    topic_tags: s.topic_tags,
  };

  if (s.id) {
    const { error } = await db.from('voice_snippets').update(fields).eq('id', s.id);
    if (error) return { error: error.message };
  } else {
    const { error } = await db.from('voice_snippets').insert({
      ...fields,
      social_account_id: null,
      source: 'manual',
      created_by: user?.id ?? null,
    });
    if (error) return { error: error.message };
  }

  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function toggleVoiceSnippetStar(id: string, isStarred: boolean) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db.from('voice_snippets').update({ is_starred: isStarred }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteVoiceSnippet(id: string) {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db.from('voice_snippets').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}
