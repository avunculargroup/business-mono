import { supabase } from '@platform/db';
import type { TranscriptFormat } from '@platform/shared';
import { resolveTranscript } from './resolveTranscript.js';
import {
  updateEpisode,
  storeAvailableTranscript,
} from './store.js';
import type { TranscriptTagCandidate } from './selectTranscriptTag.js';

// Web-requested per-episode re-run actions. Written to
// podcast_episodes.pending_action by the web app; claimed by
// podcastActionListener. 'refetch' and 'retry' re-run the waterfall as the feed
// would; 'deepgram' is the manual override of the per-feed opt-out.
export type EpisodeAction = 'refetch' | 'deepgram' | 'retry';

export interface ParsedEpisodeAction {
  // When true, force Deepgram on even if the source opted out, and drop the age
  // cap — a manual override should not be silently age-gated.
  forceDeepgram: boolean;
}

/**
 * Map a pending_action value to its resolve semantics. Pure — unit-tested.
 * Returns null for an unknown action so the listener can bail without re-running.
 */
export function parseEpisodeAction(action: string): ParsedEpisodeAction | null {
  switch (action) {
    case 'refetch':
    case 'retry':
      return { forceDeepgram: false };
    case 'deepgram':
      return { forceDeepgram: true };
    default:
      return null;
  }
}

// Map a stored transcript_format back to a representative MIME so the waterfall's
// feed-tag stage can re-fetch the original transcript_raw_url on a refetch.
const FORMAT_TO_MIME: Record<TranscriptFormat, string> = {
  json: 'application/json',
  srt: 'application/srt',
  vtt: 'text/vtt',
  html: 'text/html',
  text: 'text/plain',
};

interface EpisodeRow {
  id: string;
  source_id: string | null;
  youtube_url: string | null;
  audio_url: string | null;
  published_at: string | null;
  transcript_lang: string | null;
  transcript_raw_url: string | null;
  transcript_format: TranscriptFormat | null;
}

interface SourceRow {
  transcribe_with_deepgram: boolean;
  preferred_transcript_lang: string;
  max_episode_age_days: number | null;
}

// podcast_episodes / its new columns aren't all in the generated Database types,
// so access goes through a boundary cast (same pattern as store.ts).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Re-run the transcript waterfall for a single existing episode. Shared by the
 * web per-row actions (Fetch transcript / Transcribe with Deepgram / Retry) via
 * podcastActionListener. Reuses resolveTranscript + the store helpers so the
 * outcome handling matches the daily routine exactly.
 */
export async function reResolveEpisode(
  episodeId: string,
  parsed: ParsedEpisodeAction,
): Promise<void> {
  const { data: episode, error: epErr } = await db
    .from('podcast_episodes')
    .select(
      'id, source_id, youtube_url, audio_url, published_at, transcript_lang, transcript_raw_url, transcript_format',
    )
    .eq('id', episodeId)
    .single();
  if (epErr || !episode) {
    console.error('[podcast-action] episode not found', episodeId, epErr?.message);
    return;
  }
  const ep = episode as EpisodeRow;

  // Per-feed config when the episode belongs to a source; ad-hoc (brief)
  // episodes have no source, so synthesise a config from the episode itself.
  let config: SourceRow = {
    transcribe_with_deepgram: false,
    preferred_transcript_lang: ep.transcript_lang ?? 'en',
    max_episode_age_days: null,
  };
  if (ep.source_id) {
    const { data: src } = await db
      .from('news_sources')
      .select('transcribe_with_deepgram, preferred_transcript_lang, max_episode_age_days')
      .eq('id', ep.source_id)
      .single();
    if (src) config = src as SourceRow;
  }

  if (parsed.forceDeepgram) {
    config = { ...config, transcribe_with_deepgram: true, max_episode_age_days: null };
  }

  // A feed-tag episode keeps its raw transcript URL — feed it back as a tag so a
  // refetch retries the (free, best) publisher transcript before falling through.
  const transcriptTags: TranscriptTagCandidate[] =
    ep.transcript_raw_url && ep.transcript_format
      ? [
          {
            url: ep.transcript_raw_url,
            mimeType: FORMAT_TO_MIME[ep.transcript_format],
            language: ep.transcript_lang,
          },
        ]
      : [];

  await updateEpisode(episodeId, { transcript_status: 'resolving', transcript_error: null });

  const outcome = await resolveTranscript(
    {
      youtube_url: ep.youtube_url,
      audio_url: ep.audio_url,
      published_at: ep.published_at,
      transcriptTags,
    },
    config,
  );

  if (outcome.kind === 'available') {
    await storeAvailableTranscript(episodeId, outcome);
  } else if (outcome.kind === 'transcribing') {
    await updateEpisode(episodeId, {
      transcript_status: 'transcribing',
      deepgram_request_id: outcome.deepgramRequestId,
    });
  } else if (outcome.kind === 'skipped') {
    await updateEpisode(episodeId, { transcript_status: 'skipped' });
  } else {
    await updateEpisode(episodeId, {
      transcript_status: 'failed',
      transcript_error: outcome.error,
    });
  }
}
