// Client-safe podcast/transcript helpers for the web app. The video-ID parser
// mirrors apps/agents/src/tools/youtube.ts (extractVideoId) — kept in sync by
// hand since the two apps don't share a runtime package.

import type { TranscriptStatus, TranscriptSource } from '@platform/shared';

/** Extract a YouTube video ID from various URL formats or a raw 11-char ID. */
export function extractVideoId(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  const patterns = [
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return HTML_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Convert feed-supplied HTML (podcast show notes arrive as raw HTML via
 * rss-parser's `content`) into plain text: block tags become line breaks, all
 * other tags are dropped, and entities are decoded. Paired with `pre-wrap`
 * styling so the preserved newlines render as paragraph breaks.
 */
export function htmlToText(input: string | null | undefined): string {
  if (!input) return '';
  return decodeEntities(
    input
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|ul|ol|h[1-6]|blockquote|tr)\s*>/gi, '\n\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Poster thumbnail for the click-to-play facade (no player loaded). */
export function youtubeThumbnail(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Privacy-friendly embed URL. autoplay once the user opts into the facade;
 * startSeconds deep-links a transcript moment into the player.
 */
export function youtubeEmbedUrl(videoId: string, startSeconds?: number | null): string {
  const params = new URLSearchParams({ autoplay: '1', rel: '0' });
  if (startSeconds != null && startSeconds > 0) params.set('start', String(Math.floor(startSeconds)));
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params.toString()}`;
}

/** Format seconds into M:SS or H:MM:SS — for transcript timestamps + durations. */
export function formatTimestamp(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Deepgram spend estimate ───────────────────────────────────────────────────

/**
 * Rough per-minute Deepgram rate used only for the dashboard's *estimated* spend
 * readout. Nova-3 pre-recorded is billed per minute of audio; adjust this to your
 * actual contracted rate (in AUD) — it is a display estimate, not a billing figure.
 */
export const DEEPGRAM_COST_PER_MINUTE_AUD = 0.0065;

/**
 * Estimated realized Deepgram spend from episodes whose transcript actually came
 * from Deepgram (`transcript_source === 'deepgram'`), summing their audio minutes ×
 * the rate above. "This month" buckets on `created_at` (ingest time) as a proxy for
 * when the transcription ran — close enough for a spend estimate. Episodes with no
 * known duration contribute 0.
 */
export function estimateDeepgramCost(
  episodes: { transcript_source: TranscriptSource | null; duration_seconds: number | null; created_at: string | null }[],
  now: Date = new Date(),
): { thisMonth: number; allTime: number } {
  let allTimeSeconds = 0;
  let thisMonthSeconds = 0;
  for (const e of episodes) {
    if (e.transcript_source !== 'deepgram') continue;
    const seconds = e.duration_seconds ?? 0;
    if (seconds <= 0) continue;
    allTimeSeconds += seconds;
    if (e.created_at) {
      const d = new Date(e.created_at);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        thisMonthSeconds += seconds;
      }
    }
  }
  const cost = (seconds: number) => (seconds / 60) * DEEPGRAM_COST_PER_MINUTE_AUD;
  return { thisMonth: cost(thisMonthSeconds), allTime: cost(allTimeSeconds) };
}

/** Format an AUD amount as `A$X.XX` for the mono spend readout. */
export function formatAud(amount: number): string {
  return `A$${amount.toFixed(2)}`;
}

// ── In-transcript search highlighting ─────────────────────────────────────────

/** Escape a user query so it can be used literally inside a RegExp. */
function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Split `text` into ordered parts, flagging the case-insensitive matches of
 * `query` so the caller can wrap them in `<mark>`. An empty/whitespace query
 * returns the whole string as a single non-match part.
 */
export function highlightText(text: string, query: string): { text: string; match: boolean }[] {
  const trimmed = query.trim();
  if (!trimmed) return [{ text, match: false }];
  const re = new RegExp(escapeRegExp(trimmed), 'ig');
  const parts: { text: string; match: boolean }[] = [];
  let lastIndex = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index;
    if (start > lastIndex) parts.push({ text: text.slice(lastIndex, start), match: false });
    parts.push({ text: m[0], match: true });
    lastIndex = start + m[0].length;
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), match: false });
  return parts.length > 0 ? parts : [{ text, match: false }];
}

// ── Status + provenance presentation (spec §"Web App" token mapping) ──────────

type ChipColor = 'neutral' | 'accent' | 'success' | 'warning' | 'destructive';

export const TRANSCRIPT_STATUS_LABELS: Record<TranscriptStatus, string> = {
  pending: 'Pending',
  resolving: 'Resolving',
  transcribing: 'Transcribing',
  available: 'Available',
  failed: 'Failed',
  skipped: 'Skipped',
};

// available → success; transcribing → warning; pending/resolving → secondary
// (neutral); skipped → muted (neutral); failed → destructive.
export const TRANSCRIPT_STATUS_COLORS: Record<TranscriptStatus, ChipColor> = {
  pending: 'neutral',
  resolving: 'neutral',
  transcribing: 'warning',
  available: 'success',
  failed: 'destructive',
  skipped: 'neutral',
};

export const TRANSCRIPT_SOURCE_LABELS: Record<TranscriptSource, string> = {
  feed_tag: 'Publisher feed',
  youtube: 'YouTube',
  deepgram: 'Deepgram',
  manual: 'Manual',
};

// ── Dashboard metrics ────────────────────────────────────────────────────────
// Pure aggregations for the podcast dashboard, extracted from PodcastDashboard
// so the counting logic is unit-testable and the view just renders the result.

/** Transcript statuses that count as "in progress" / "needs attention" on the
 *  dashboard KPI row. */
export const IN_PROGRESS_STATUSES: TranscriptStatus[] = ['resolving', 'transcribing'];
export const NEEDS_ATTENTION_STATUSES: TranscriptStatus[] = ['failed', 'skipped'];

export interface PodcastKpiEpisode {
  transcript_status: TranscriptStatus;
  embedded_at: string | null;
}

export interface PodcastKpis {
  total: number;
  available: number;
  inProgress: number;
  needsAttention: number;
  indexed: number;
}

/** Headline counts for the KPI row. */
export function computeKpis(episodes: PodcastKpiEpisode[]): PodcastKpis {
  let available = 0;
  let inProgress = 0;
  let needsAttention = 0;
  let indexed = 0;
  for (const e of episodes) {
    if (e.transcript_status === 'available') available += 1;
    if (IN_PROGRESS_STATUSES.includes(e.transcript_status)) inProgress += 1;
    if (NEEDS_ATTENTION_STATUSES.includes(e.transcript_status)) needsAttention += 1;
    if (e.embedded_at) indexed += 1;
  }
  return { total: episodes.length, available, inProgress, needsAttention, indexed };
}

export interface PodcastSourceEpisode {
  transcript_status: TranscriptStatus;
  transcript_source: TranscriptSource | null;
}

export interface PodcastSourceBreakdown {
  feedTag: number;
  youtube: number;
  deepgram: number;
  none: number;
  total: number;
}

/** How the available transcripts were obtained (feed tag / YouTube / Deepgram),
 *  with the remainder counted as "none". */
export function computeSourceBreakdown(episodes: PodcastSourceEpisode[]): PodcastSourceBreakdown {
  let feedTag = 0;
  let youtube = 0;
  let deepgram = 0;
  for (const e of episodes) {
    if (e.transcript_status !== 'available') continue;
    if (e.transcript_source === 'feed_tag') feedTag += 1;
    else if (e.transcript_source === 'youtube') youtube += 1;
    else if (e.transcript_source === 'deepgram') deepgram += 1;
  }
  const none = episodes.length - feedTag - youtube - deepgram;
  return { feedTag, youtube, deepgram, none, total: episodes.length };
}

/** Sort key for "most recent" — published date, falling back to creation date. */
export function episodeRecency(e: { published_at: string | null; created_at: string | null }): number {
  const d = e.published_at ?? e.created_at;
  return d ? new Date(d).getTime() : 0;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Episodes ingested per day over the trailing N days (by created_at), labelled MM-DD. */
export function dailyCounts(
  episodes: { created_at: string | null }[],
  days: number,
): { date: string; count: number }[] {
  const buckets = new Map<string, number>();
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets.set(dayKey(d), 0);
  }
  for (const e of episodes) {
    if (!e.created_at) continue;
    const key = dayKey(new Date(e.created_at));
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([date, count]) => ({ date: date.slice(5), count }));
}

/** [value, label] pairs for the transcript-status filter dropdown. */
export function statusOptions(): [string, string][] {
  return (Object.keys(TRANSCRIPT_STATUS_LABELS) as TranscriptStatus[]).map((s) => [
    s,
    TRANSCRIPT_STATUS_LABELS[s],
  ]);
}
