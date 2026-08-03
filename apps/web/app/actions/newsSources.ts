'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveFeedUrl } from '@platform/shared';
import { validateFeedUrl } from '@/lib/news/validateFeed';
import { slugify, computeInboundAddress, parseSenderAllowlist } from '@/lib/news/emailSource';
import { formBoolean } from '@/lib/formBoolean';
import { humanizeError } from '@/lib/errors';

const REVALIDATE = '/news/sources';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  source_type: z.enum(['rss', 'podcast', 'youtube', 'email', 'report_watch']).default('rss'),
  site_url: z.string().trim().url('Site URL must be a valid URL').optional().or(z.literal('')),
  feed_url: z.string().trim().url('Feed URL must be a valid URL').optional().or(z.literal('')),
  youtube_channel_url: z
    .string()
    .trim()
    .url('YouTube channel URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  is_active: formBoolean(true),
  transcribe_with_deepgram: formBoolean(false),
  preferred_transcript_lang: z.string().trim().optional().default('en'),
  max_backfill_episodes: z.coerce.number().int().positive().optional().default(25),
  // Empty string → undefined → null (no cap).
  max_episode_age_days: z.coerce.number().int().positive().optional(),
  // Email source fields.
  slug: z.string().trim().optional().default(''),
  tier: z.enum(['tier_1', 'tier_2', 'tier_3']).optional().or(z.literal('')),
  relevance_threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  // Newline/comma-separated From addresses or domains.
  sender_allowlist: z.string().optional().default(''),
  follow_links: formBoolean(false),
  max_followed_links: z.coerce.number().int().min(0).max(20).optional().default(5),
  // Report-watch fields. detection_config arrives as a JSON string from the
  // form: the three strategies share almost nothing structurally, so a flat set
  // of form fields would need one input per strategy per key.
  detection_strategies: z.string().optional().default(''),
  detection_config: z.string().optional().default('{}'),
  redistribution_default: z
    .enum(['internal_only', 'quotable', 'client_shareable'])
    .optional()
    .default('internal_only'),
  licence_notes: z.string().optional().default(''),
  ocr_enabled: formBoolean(false),
  ocr_page_limit: z.coerce.number().int().min(1).max(500).optional().default(40),
  crawl_delay_seconds: z.coerce.number().int().min(0).max(120).optional().default(5),
  max_candidates_per_run: z.coerce.number().int().min(1).max(200).optional().default(25),
});

const STRATEGIES = ['rss', 'sitemap', 'index_page'] as const;

/** Comma-separated strategy list from the form, order preserved, unknowns dropped. */
function parseStrategies(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is (typeof STRATEGIES)[number] => (STRATEGIES as readonly string[]).includes(s));
}

/** A malformed config blob is a validation error, not something to persist. */
function parseDetectionConfig(raw: string): { config: Record<string, unknown> } | { error: string } {
  if (!raw.trim()) return { config: {} };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Detection configuration must be a JSON object.' };
    }
    return { config: parsed as Record<string, unknown> };
  } catch {
    return { error: 'Detection configuration is not valid JSON.' };
  }
}

type SourceInput = z.infer<typeof schema>;

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // An empty max-age field must mean "no cap", not 0.
  if (raw['max_episode_age_days'] === '') delete raw['max_episode_age_days'];
  return schema.safeParse(raw);
}

// Resolve the per-type feed/channel fields, or return an error message.
function resolveLocation(input: SourceInput): { feed_url: string | null; error?: string } {
  if (input.source_type === 'email') {
    if (!slugify(input.slug)) {
      return { feed_url: null, error: 'Provide a slug for the email source (used in its inbound address).' };
    }
    return { feed_url: null };
  }
  if (input.source_type === 'youtube') {
    if (!input.youtube_channel_url) {
      return { feed_url: null, error: 'Provide a YouTube channel or playlist URL.' };
    }
    return { feed_url: null };
  }
  if (input.source_type === 'report_watch') {
    // A report watch has no feed_url — its URLs live in detection_config, which
    // is validated in buildRow along with the strategy list.
    if (parseStrategies(input.detection_strategies).length === 0) {
      return { feed_url: null, error: 'Choose at least one detection strategy.' };
    }
    return { feed_url: null };
  }
  const feedUrl = resolveFeedUrl(input.site_url || null, input.feed_url || null);
  if (!feedUrl) {
    return {
      feed_url: null,
      error:
        input.source_type === 'podcast'
          ? 'Provide the podcast feed URL.'
          : 'Provide a feed URL (RSS/Atom), or a Substack site URL so the feed can be derived.',
    };
  }
  return { feed_url: feedUrl };
}

// Build the news_sources row. Transcript settings only apply to podcast/youtube;
// slug/inbound_address/allowlist/tier/threshold apply to email.
function buildRow(input: SourceInput, feedUrl: string | null): Record<string, unknown> | { error: string } {
  const base = {
    name: input.name,
    source_type: input.source_type,
    site_url: input.site_url || null,
    feed_url: feedUrl,
    youtube_channel_url: input.youtube_channel_url || null,
    is_active: input.is_active,
  };
  if (input.source_type === 'email') {
    const slug = slugify(input.slug);
    return {
      ...base,
      site_url: null,
      feed_url: null,
      youtube_channel_url: null,
      transcribe_with_deepgram: false,
      slug,
      inbound_address: computeInboundAddress(slug),
      sender_allowlist: parseSenderAllowlist(input.sender_allowlist),
      tier: input.tier || null,
      relevance_threshold: input.relevance_threshold,
      follow_links: input.follow_links,
      max_followed_links: input.max_followed_links,
    };
  }
  if (input.source_type === 'report_watch') {
    const parsed = parseDetectionConfig(input.detection_config);
    if ('error' in parsed) return parsed;
    return {
      ...base,
      feed_url: null,
      youtube_channel_url: null,
      transcribe_with_deepgram: false,
      detection_strategies: parseStrategies(input.detection_strategies),
      detection_config: parsed.config,
      redistribution_default: input.redistribution_default,
      licence_notes: input.licence_notes.trim() || null,
      ocr_enabled: input.ocr_enabled,
      ocr_page_limit: input.ocr_page_limit,
      crawl_delay_seconds: input.crawl_delay_seconds,
      max_candidates_per_run: input.max_candidates_per_run,
      tier: input.tier || null,
      relevance_threshold: input.relevance_threshold,
    };
  }
  if (input.source_type === 'rss') {
    return { ...base, transcribe_with_deepgram: false };
  }
  return {
    ...base,
    transcribe_with_deepgram: input.transcribe_with_deepgram,
    preferred_transcript_lang: input.preferred_transcript_lang,
    max_backfill_episodes: input.max_backfill_episodes,
    max_episode_age_days: input.max_episode_age_days ?? null,
  };
}

export async function createNewsSource(formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const input = parsed.data;
  const { feed_url, error } = resolveLocation(input);
  if (error) return { error };

  // RSS feeds are validated up front; podcast feeds vary too much, so the
  // ingest routine validates them tolerantly at scan time.
  if (input.source_type === 'rss' && feed_url) {
    const feedCheck = await validateFeedUrl(feed_url);
    if (!feedCheck.ok) return { error: feedCheck.error };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const row = buildRow(input, feed_url);
  if ('error' in row) return { error: row.error as string };
  const { error: dbError } = await supabase.from('news_sources').insert(row as never);

  if (dbError) return { error: humanizeError(dbError) };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function updateNewsSource(id: string, formData: FormData) {
  const parsed = parse(formData);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const input = parsed.data;
  const { feed_url, error } = resolveLocation(input);
  if (error) return { error };

  if (input.source_type === 'rss' && feed_url) {
    const feedCheck = await validateFeedUrl(feed_url);
    if (!feedCheck.ok) return { error: feedCheck.error };
  }

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const row = buildRow(input, feed_url);
  if ('error' in row) return { error: row.error as string };
  const { error: dbError } = await supabase
    .from('news_sources')
    .update(row as never)
    .eq('id', id);

  if (dbError) return { error: humanizeError(dbError) };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteNewsSource(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('news_sources').delete().eq('id', id);
  if (error) return { error: humanizeError(error) };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function toggleNewsSourceActive(id: string, isActive: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase.from('news_sources').update({ is_active: isActive }).eq('id', id);
  if (error) return { error: humanizeError(error) };
  revalidatePath(REVALIDATE);
  return { success: true };
}
