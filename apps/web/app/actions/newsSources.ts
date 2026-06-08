'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { resolveFeedUrl } from '@platform/shared';
import { validateFeedUrl } from '@/lib/news/validateFeed';

const REVALIDATE = '/news/sources';

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  source_type: z.enum(['rss', 'podcast', 'youtube']).default('rss'),
  site_url: z.string().trim().url('Site URL must be a valid URL').optional().or(z.literal('')),
  feed_url: z.string().trim().url('Feed URL must be a valid URL').optional().or(z.literal('')),
  youtube_channel_url: z
    .string()
    .trim()
    .url('YouTube channel URL must be a valid URL')
    .optional()
    .or(z.literal('')),
  is_active: z.coerce.boolean().optional().default(true),
  transcribe_with_deepgram: z.coerce.boolean().optional().default(false),
  preferred_transcript_lang: z.string().trim().optional().default('en'),
  max_backfill_episodes: z.coerce.number().int().positive().optional().default(25),
  // Empty string → undefined → null (no cap).
  max_episode_age_days: z.coerce.number().int().positive().optional(),
});

type SourceInput = z.infer<typeof schema>;

function parse(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  // An empty max-age field must mean "no cap", not 0.
  if (raw['max_episode_age_days'] === '') delete raw['max_episode_age_days'];
  return schema.safeParse(raw);
}

// Resolve the per-type feed/channel fields, or return an error message.
function resolveLocation(input: SourceInput): { feed_url: string | null; error?: string } {
  if (input.source_type === 'youtube') {
    if (!input.youtube_channel_url) {
      return { feed_url: null, error: 'Provide a YouTube channel or playlist URL.' };
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

// Build the news_sources row. Transcript settings only apply to podcast/youtube.
function buildRow(input: SourceInput, feedUrl: string | null) {
  const base = {
    name: input.name,
    source_type: input.source_type,
    site_url: input.site_url || null,
    feed_url: feedUrl,
    youtube_channel_url: input.youtube_channel_url || null,
    is_active: input.is_active,
  };
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

  const supabase = await createClient();
  const { error: dbError } = await supabase.from('news_sources').insert(buildRow(input, feed_url) as never);

  if (dbError) return { error: dbError.message };
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

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from('news_sources')
    .update(buildRow(input, feed_url) as never)
    .eq('id', id);

  if (dbError) return { error: dbError.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function deleteNewsSource(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('news_sources').delete().eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}

export async function toggleNewsSourceActive(id: string, isActive: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from('news_sources').update({ is_active: isActive }).eq('id', id);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true };
}
