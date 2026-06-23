import { extractVideoId } from '../tools/youtube.js';
import { normalizeTranscriptTags, type TranscriptTagCandidate } from './transcripts/selectTranscriptTag.js';

// Raw rss-parser item shape for a podcast feed (custom fields surfaced by
// fetchPodcastFeed). Everything optional — feeds are inconsistent.
export interface PodcastFeedItem {
  guid?: string;
  title?: string;
  link?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
  enclosure?: { url?: string; type?: string; length?: string };
  podcastTranscripts?: unknown;
  itunesDuration?: string;
  itunesSeason?: string;
  itunesEpisode?: string;
  itunesImage?: unknown;
}

export interface PodcastEpisodeCandidate {
  guid: string;
  title: string;
  description: string | null;
  episode_url: string | null;
  audio_url: string | null;
  audio_mime_type: string | null;
  duration_seconds: number | null;
  youtube_url: string | null;
  season: number | null;
  episode_number: number | null;
  image_url: string | null;
  published_at: string | null;
  transcriptTags: TranscriptTagCandidate[];
}

const YOUTUBE_URL_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?[^\s"'<>]+|youtu\.be\/[A-Za-z0-9_-]{11}[^\s"'<>]*)/i;

// Pull an explicit YouTube link out of show notes — we only use YouTube when a
// real video is linked (spec Open Question: explicit-link-only, no fuzzy match).
export function extractYoutubeUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(YOUTUBE_URL_RE);
  if (!match) return null;
  return extractVideoId(match[0]) ? match[0] : null;
}

// iTunes duration is "HH:MM:SS", "MM:SS", or a raw second count.
export function parseItunesDuration(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const parts = trimmed.split(':').map((p) => Number(p));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  return null;
}

function imageUrl(raw: unknown): string | null {
  if (!raw) return null;
  if (typeof raw === 'string') return raw;
  const href = (raw as { $?: { href?: unknown }; href?: unknown }).$?.href ?? (raw as { href?: unknown }).href;
  return typeof href === 'string' ? href : null;
}

function toInt(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) ? n : null;
}

/**
 * Pure: turn one podcast feed's parsed items into episode candidates. Keeps
 * items published within the lookback window (undated items kept — dedup guards
 * repeats), caps to maxItems, and maps fields. Dedup on guid is the caller's job.
 */
export function normalizePodcastItems(
  items: PodcastFeedItem[],
  opts: { cutoffMs: number; maxItems: number },
): PodcastEpisodeCandidate[] {
  const out: PodcastEpisodeCandidate[] = [];
  for (const it of items) {
    const iso = it.isoDate ?? it.pubDate;
    if (iso && new Date(iso).getTime() < opts.cutoffMs) continue;

    // guid is the dedupe key; fall back to the enclosure URL, then the page link.
    const guid = it.guid?.trim() || it.enclosure?.url?.trim() || it.link?.trim();
    if (!guid) continue;

    const description = (it.content ?? it.contentSnippet ?? '').trim() || null;

    out.push({
      guid,
      title: it.title?.trim() || guid,
      description,
      episode_url: it.link?.trim() ?? null,
      audio_url: it.enclosure?.url?.trim() ?? null,
      audio_mime_type: it.enclosure?.type?.trim() ?? null,
      duration_seconds: parseItunesDuration(it.itunesDuration),
      youtube_url: extractYoutubeUrl(it.content ?? it.contentSnippet ?? it.link),
      season: toInt(it.itunesSeason),
      episode_number: toInt(it.itunesEpisode),
      image_url: imageUrl(it.itunesImage),
      published_at: it.isoDate ?? null,
      transcriptTags: normalizeTranscriptTags(it.podcastTranscripts),
    });
    if (out.length >= opts.maxItems) break;
  }
  return out;
}
