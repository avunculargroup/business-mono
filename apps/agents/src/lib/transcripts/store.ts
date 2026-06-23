import { supabase } from '@platform/db';
import type { TranscriptFormat, TranscriptSource } from '@platform/shared';
import { buildSegments, embedEpisodeSegments } from './embedSegments.js';
import type { TimedSegment } from './parsers.js';

// podcast_episodes is not in the generated Database types until
// `pnpm --filter @platform/db generate-types` runs post-migration. Cast at the
// boundary; updates here use a small explicit patch shape.
export interface EpisodePatch {
  transcript_status?: string;
  transcript_source?: TranscriptSource | null;
  transcript_format?: TranscriptFormat | null;
  transcript_lang?: string | null;
  transcript_text?: string | null;
  transcript_raw_url?: string | null;
  has_timestamps?: boolean;
  deepgram_request_id?: string | null;
  transcript_error?: string | null;
  transcript_fetched_at?: string | null;
  embedded_at?: string | null;
}

export interface EpisodeInsert {
  source_id: string | null;
  guid: string;
  title: string;
  description?: string | null;
  episode_url?: string | null;
  audio_url?: string | null;
  audio_mime_type?: string | null;
  duration_seconds?: number | null;
  youtube_url?: string | null;
  season?: number | null;
  episode_number?: number | null;
  image_url?: string | null;
  published_at?: string | null;
  ingestion_origin?: string;
  curator_note?: string | null;
  transcript_status?: string;
}

// podcast_episodes / transcript_segments aren't in the generated Database types
// until `pnpm --filter @platform/db generate-types` runs post-migration, so all
// access here goes through an explicit boundary cast (same pattern as
// contentEmbeddings.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const episodes = () => (supabase as any).from('podcast_episodes');

export async function updateEpisode(episodeId: string, patch: EpisodePatch): Promise<void> {
  const { error } = await episodes().update(patch).eq('id', episodeId);
  if (error) throw new Error(`podcast_episodes update failed: ${error.message}`);
}

/** Insert one episode and return its id. */
export async function insertEpisode(row: EpisodeInsert): Promise<string> {
  const { data, error } = await episodes().insert(row).select('id').single();
  if (error) throw new Error(`podcast_episodes insert failed: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Insert one episode, or return null if a row with the same guid already exists
 * for this source. During feed ingestion a duplicate guid is an EXPECTED
 * condition — the episode was ingested on a prior run, or the feed repeats a
 * guid within one batch — so it must not abort the whole feed. Postgres reports
 * the unique-index violation (podcast_episodes_source_guid_uniq /
 * podcast_episodes_adhoc_guid_uniq) as code 23505; any other error still throws.
 */
export async function insertEpisodeIfNew(row: EpisodeInsert): Promise<string | null> {
  const { data, error } = await episodes().insert(row).select('id').single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return null;
    throw new Error(`podcast_episodes insert failed: ${error.message}`);
  }
  return (data as { id: string }).id;
}

/** The guids already ingested for a source — used to dedupe new feed items. */
export async function fetchExistingGuids(sourceId: string): Promise<Set<string>> {
  const { data, error } = await episodes().select('guid').eq('source_id', sourceId);
  if (error) throw new Error(`podcast_episodes guid fetch failed: ${error.message}`);
  return new Set(((data ?? []) as Array<{ guid: string }>).map((r) => r.guid));
}

export interface AvailableTranscript {
  source: TranscriptSource;
  format: TranscriptFormat | null;
  language: string | null;
  text: string;
  segments: TimedSegment[];
  hasTimestamps: boolean;
  rawUrl?: string | null;
}

/**
 * Persist a resolved transcript on the episode, then chunk + embed it into
 * transcript_segments and stamp embedded_at. Shared by the daily routine (feed
 * tag / YouTube), the brief path, and the Deepgram webhook. Returns the number
 * of segments embedded.
 */
export async function storeAvailableTranscript(
  episodeId: string,
  t: AvailableTranscript,
): Promise<{ segments: number }> {
  await updateEpisode(episodeId, {
    transcript_status: 'available',
    transcript_source: t.source,
    transcript_format: t.format,
    transcript_lang: t.language,
    transcript_text: t.text,
    transcript_raw_url: t.rawUrl ?? null,
    has_timestamps: t.hasTimestamps,
    transcript_fetched_at: new Date().toISOString(),
    transcript_error: null,
  });

  const drafts = buildSegments(t.hasTimestamps ? t.segments : null, t.text);
  const { segments } = await embedEpisodeSegments(episodeId, drafts);

  await updateEpisode(episodeId, { embedded_at: new Date().toISOString() });
  return { segments };
}
