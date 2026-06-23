import type { TranscriptFormat, TranscriptSource } from '@platform/shared';
import { fetchText } from '../fetchFeed.js';
import { DEEPGRAM_CALLBACK_URL } from '../deepgramCallback.js';
import { deepgramTranscribe } from '../../tools/deepgram.js';
import { fetchYoutubeSegments } from '../../tools/youtube.js';
import {
  parseVtt,
  parseSrt,
  parseJson,
  parseHtml,
  parsePlainText,
  type ParsedTranscript,
  type TimedSegment,
} from './parsers.js';
import {
  selectBestTranscriptTag,
  type TranscriptTagCandidate,
} from './selectTranscriptTag.js';

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Hard cap on a fetched feed-tag transcript. Real transcripts are tiny — even a
// 3-hour show is a few hundred KB of text, and markup inflation keeps the worst
// honest case around a megabyte — so 2 MB is still generous headroom. The first
// pass set this to 12 MB, but the agents host runs a small heap (~256 MB) that
// sits near its ceiling at baseline, and a 12 MB body fed through parseHtml's
// ~10 chained regex .replace() passes (each allocating a fresh multi-MB string)
// still spiked enough transient garbage to OOM mid-replace. 2 MB bounds both that
// regex spike and the downstream chunk/embed fan-out a single oversized tag can
// demand. On overflow fetchText throws and the waterfall falls through.
const MAX_TRANSCRIPT_BYTES = 2 * 1024 * 1024;

// What the routine/brief passes in. transcriptTags come from the feed item's
// <podcast:transcript> elements (empty for ad-hoc/brief episodes).
export interface ResolveEpisodeInput {
  youtube_url?: string | null;
  audio_url?: string | null;
  published_at?: string | null;
  transcriptTags?: TranscriptTagCandidate[];
}

// The per-feed knobs that gate the waterfall (a subset of news_sources; a brief
// supplies a synthetic config with deepgram allowed).
export interface ResolveSourceConfig {
  transcribe_with_deepgram: boolean;
  preferred_transcript_lang: string;
  max_episode_age_days: number | null;
}

export type ResolveOutcome =
  | {
      kind: 'available';
      source: TranscriptSource;
      format: TranscriptFormat | null;
      language: string | null;
      text: string;
      segments: TimedSegment[];
      hasTimestamps: boolean;
      rawUrl?: string | null;
    }
  | { kind: 'transcribing'; deepgramRequestId: string }
  | { kind: 'skipped' }
  | { kind: 'failed'; error: string };

function parseByFormat(raw: string, format: TranscriptFormat): ParsedTranscript {
  switch (format) {
    case 'json': return parseJson(raw);
    case 'vtt':  return parseVtt(raw);
    case 'srt':  return parseSrt(raw);
    case 'html': return parseHtml(raw);
    case 'text': return parsePlainText(raw);
  }
}

function isOlderThan(publishedAt: string | null | undefined, days: number): boolean {
  if (!publishedAt) return false;
  const ts = new Date(publishedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return ts < Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * The transcript waterfall: try the cheapest source first, fall through only
 * when needed (spec §"The Transcript Waterfall").
 *   1. <podcast:transcript> feed tag  — free, instant, publisher-authored
 *   2. YouTube captions               — free, but only when an explicit video is mapped
 *   3. Deepgram                       — paid, opt-in per feed, async (returns 'transcribing')
 * Errors at stages 1-2 are non-fatal and fall through; total exhaustion yields
 * 'skipped' (no Deepgram) or 'failed' (Deepgram submit errored).
 */
export async function resolveTranscript(
  episode: ResolveEpisodeInput,
  source: ResolveSourceConfig,
): Promise<ResolveOutcome> {
  // ── 1. Feed-supplied <podcast:transcript> ──────────────────────────────────
  const tags = episode.transcriptTags ?? [];
  if (tags.length > 0) {
    const best = selectBestTranscriptTag(tags, source.preferred_transcript_lang);
    if (best) {
      try {
        const raw = await fetchText(
          best.url,
          { 'User-Agent': BROWSER_UA, Accept: '*/*' },
          MAX_TRANSCRIPT_BYTES,
        );
        const parsed = parseByFormat(raw, best.format);
        if (parsed.text) {
          return {
            kind: 'available',
            source: 'feed_tag',
            format: best.format,
            language: best.language,
            text: parsed.text,
            segments: parsed.segments,
            hasTimestamps: parsed.hasTimestamps,
            rawUrl: best.url,
          };
        }
      } catch {
        // Fall through to the next source — a broken transcript URL is not fatal.
      }
    }
  }

  // ── 2. YouTube captions (explicit link only — no fuzzy title matching) ──────
  if (episode.youtube_url) {
    try {
      const yt = await fetchYoutubeSegments(
        episode.youtube_url,
        source.preferred_transcript_lang,
      );
      if (yt.segments.length > 0) {
        const segments: TimedSegment[] = yt.segments.map((s) => ({
          start: s.start,
          end: s.end,
          speaker: null,
          text: s.text,
        }));
        return {
          kind: 'available',
          source: 'youtube',
          format: null,
          language: yt.language,
          text: segments.map((s) => s.text).join('\n').trim(),
          segments,
          hasTimestamps: true,
        };
      }
    } catch {
      // YouTube's caption endpoint is flaky by design — fall through, never fail.
    }
  }

  // ── 3. Deepgram (opt-in, age-gated, async) ──────────────────────────────────
  if (source.transcribe_with_deepgram && episode.audio_url) {
    if (
      source.max_episode_age_days !== null &&
      isOlderThan(episode.published_at, source.max_episode_age_days)
    ) {
      return { kind: 'skipped' };
    }
    try {
      const result = (await deepgramTranscribe.execute!(
        {
          audioUrl: episode.audio_url,
          callbackUrl: DEEPGRAM_CALLBACK_URL,
          multichannel: false,
          diarize: true,
        } as never,
        {} as never,
      )) as { requestId: string };
      if (!result.requestId) {
        return { kind: 'failed', error: 'Deepgram returned no request id' };
      }
      return { kind: 'transcribing', deepgramRequestId: result.requestId };
    } catch (err) {
      return { kind: 'failed', error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── 4. Nothing free, Deepgram off ───────────────────────────────────────────
  return { kind: 'skipped' };
}
