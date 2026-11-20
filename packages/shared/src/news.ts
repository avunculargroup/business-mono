// ============================================================
// News aggregation — types and contracts
// ============================================================

import type {
  ReportDetectionStrategy,
  ReportDetectionConfig,
  ReportRedistribution,
} from './reportWatch.js';
import { DEFAULT_TIMEZONE } from './constants.js';

export const NewsCategory = {
  REGULATORY:    'regulatory',    // ASIC, ATO, APRA, government policy
  CORPORATE:     'corporate',     // ASX companies, treasury announcements
  MACRO:         'macro',         // RBA rates, AUD, inflation
  INTERNATIONAL: 'international', // US/EU/global regulation with AU implications
} as const;
export type NewsCategory = (typeof NewsCategory)[keyof typeof NewsCategory];

export const NewsStatus = {
  NEW:                'new',
  REVIEWED:           'reviewed',
  ARCHIVED:           'archived',
  PROMOTED:           'promoted',
  EXTRACTION_FAILED:  'extraction_failed',
} as const;
export type NewsStatus = (typeof NewsStatus)[keyof typeof NewsStatus];

// What a key point is doing in its article. An article published today still
// restates last month's facts as context, and a stored point carried no way to
// tell the two apart — which is how "The RBA raised the cash rate to 4.60%",
// background in a 25 Oct opinion piece, went out in a digest as that day's news.
//   new         — what this article itself reports for the first time
//   background  — an earlier fact restated for context (a past decision, prior data)
//   opinion     — the author's or a quoted person's view, forecast or argument
export const KeyPointKind = {
  NEW:        'new',
  BACKGROUND: 'background',
  OPINION:    'opinion',
} as const;
export type KeyPointKind = (typeof KeyPointKind)[keyof typeof KeyPointKind];

export interface KeyPoint {
  text: string;
  kind: KeyPointKind;
  // The date the fact refers to: YYYY-MM-DD, YYYY-MM or YYYY, never later than
  // the item's published_at. For `new` points code stamps the Melbourne date of
  // published_at; for background/opinion it is the model's date if it passes
  // normalizeAsOf, else null. Never free text — see stampKeyPointAsOf.
  asOf?: string | null;
}

const KEY_POINT_KINDS = new Set<string>(Object.values(KeyPointKind));

// YYYY, YYYY-MM or YYYY-MM-DD. Calendar validity is checked separately.
const AS_OF_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** YYYY-MM-DD of an instant in Australia/Melbourne, or null for a missing/unparseable timestamp. */
export function melbourneDate(timestamp: string | null | undefined): string | null {
  if (!timestamp) return null;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** True for a real calendar date in one of the three accepted precisions. */
export function isValidAsOf(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const m = AS_OF_RE.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  if (year < 1900) return false;
  if (m[2] === undefined) return true;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return false;
  if (m[3] === undefined) return true;
  const day = Number(m[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

/**
 * A model-supplied asOf, made safe to filter on: a valid date not later than
 * the item's publication date (compared at the asOf's own precision, so
 * '2026-11' is fine for an item published 17 Nov 2026), else null.
 */
export function normalizeAsOf(raw: unknown, publishedAt?: string | null): string | null {
  if (!isValidAsOf(raw)) return null;
  const published = melbourneDate(publishedAt);
  if (published && raw > published.slice(0, raw.length)) return null;
  return raw;
}

/**
 * Sets every point's asOf in code. `new` points take the Melbourne date of
 * published_at — a new point is, by definition, news as of the item — and
 * the model's value for them is ignored. Background/opinion keep only a
 * value normalizeAsOf accepts.
 */
export function stampKeyPointAsOf(points: KeyPoint[], publishedAt: string | null | undefined): KeyPoint[] {
  const published = melbourneDate(publishedAt);
  return points.map((p) => ({
    ...p,
    asOf: p.kind === 'new' ? published : normalizeAsOf(p.asOf, publishedAt),
  }));
}

/**
 * Reads news_items.key_points (JSONB) into KeyPoint[]. Rows extracted before
 * the kinds existed hold bare strings; those read as `new`, which is exactly
 * how every consumer treated them before, so an un-backfilled row behaves as
 * it always did. Anything unrecognisable is dropped rather than guessed at.
 *
 * asOf is validated on the way in, so a consumer never sees the free text
 * older rows hold ('present', '2023-11-07' on a 2026 item). With publishedAt,
 * the full stampKeyPointAsOf rule applies.
 */
export function normalizeKeyPoints(raw: unknown, publishedAt?: string | null): KeyPoint[] {
  if (!Array.isArray(raw)) return [];
  const out: KeyPoint[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      if (entry.trim()) {
        const stamped = publishedAt === undefined ? null : melbourneDate(publishedAt);
        out.push({ text: entry, kind: 'new', ...(stamped ? { asOf: stamped } : {}) });
      }
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const { text, kind, asOf } = entry as Record<string, unknown>;
    if (typeof text !== 'string' || !text.trim()) continue;
    if (typeof kind !== 'string' || !KEY_POINT_KINDS.has(kind)) continue;
    const k = kind as KeyPointKind;
    // With publishedAt, the full stamping rule; without it, format checks only.
    const stamped = k === 'new' && publishedAt !== undefined ? melbourneDate(publishedAt) : normalizeAsOf(asOf, publishedAt);
    out.push({ text, kind: k, ...(stamped ? { asOf: stamped } : {}) });
  }
  return out;
}

/** The points that are this article's own news — the only ones a "today" summary may state as fact. */
export function newKeyPoints(points: KeyPoint[]): KeyPoint[] {
  return points.filter((p) => p.kind === 'new');
}

/**
 * One prompt line per point, labelled with its kind, for long-form writers
 * that may use background as context but must not present it as news.
 */
export function formatKeyPointsForPrompt(points: KeyPoint[]): string[] {
  return points.map((p) =>
    p.kind === 'new'
      ? p.text
      : `[${p.kind}${p.asOf ? `, as of ${p.asOf}` : ''}] ${p.text}`,
  );
}

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  regulatory:    'Regulatory',
  corporate:     'Corporate',
  macro:         'Macro',
  international: 'International',
};

export const NewsRelevanceFilter = {
  AU_OR_BITCOIN: 'au_or_bitcoin', // default — drop only if neither AU nor Bitcoin relevant
  BITCOIN:       'bitcoin',       // drop unless Bitcoin relevant
  NONE:          'none',          // never drop on relevance — trust the LLM judge
} as const;
export type NewsRelevanceFilter = (typeof NewsRelevanceFilter)[keyof typeof NewsRelevanceFilter];

// The relevance gate to apply when a routine's action_config omits relevance_filter.
// Category-aware so the intent is durable: macro feeds cover global stories (Fed,
// Treasuries, gold, de-dollarization) that are inherently neither Australian- nor
// Bitcoin-specific, so they must NOT pass through the au_or_bitcoin gate or every
// curated story gets dropped. Keeping this in code (rather than a one-off data
// migration) means editing the routine can't silently reinstate the wrong default.
export function defaultRelevanceFilter(category: NewsCategory): NewsRelevanceFilter {
  return category === NewsCategory.MACRO
    ? NewsRelevanceFilter.NONE
    : NewsRelevanceFilter.AU_OR_BITCOIN;
}

export interface NewsIngestionConfig {
  category: NewsCategory;
  queries: string[];
  max_results_per_query: number;
  // Hard cap on stories ingested per run after the LLM judge ranks the pool.
  max_curated?: number;
  search_depth?: 'basic' | 'advanced';
  // Which relevance axes a story must satisfy to be kept. Omitted = 'au_or_bitcoin'
  // (legacy behaviour). 'none' keeps everything the judge curated (used by macro).
  relevance_filter?: NewsRelevanceFilter;
}

// Derive the feed URL the scan routine reads. A direct feedUrl always wins.
// Otherwise, Substack publications expose their feed at <site>/feed, so we can
// derive it from the homepage; other sites must supply feedUrl explicitly.
// Returns null when no feed can be determined.
export function resolveFeedUrl(
  siteUrl: string | undefined | null,
  feedUrl: string | undefined | null,
): string | null {
  const feed = feedUrl?.trim();
  if (feed) return feed;
  const site = siteUrl?.trim().replace(/\/+$/, '');
  if (!site) return null;
  try {
    if (/(^|\.)substack\.com$/i.test(new URL(site).hostname)) {
      return `${site}/feed`;
    }
  } catch {
    return null;
  }
  return null;
}

// A user-curated publication scanned via its RSS/Atom feed, watched as a
// podcast/YouTube channel, or received as an email newsletter. Managed from the
// web app (/news/sources) or by Simon. Distinct from the keyword-search
// NewsIngestionConfig — sources name specific publications to watch.
export type NewsSourceType = 'rss' | 'podcast' | 'youtube' | 'email' | 'report_watch';

// Visual prominence / Rex calibration tier, shared across source types.
export type NewsTier = 'tier_1' | 'tier_2' | 'tier_3';

export interface NewsSourceRecord {
  id: string;
  name: string;
  site_url: string | null;
  // Nullable since 'youtube'/'email' sources have no RSS/podcast feed URL.
  feed_url: string | null;
  is_active: boolean;
  // Discriminator. 'rss' is the legacy default; 'podcast'/'youtube'/'email' are new.
  source_type: NewsSourceType;
  // Optional channel/playlist; for podcasts it aids the YouTube transcript fallback.
  youtube_channel_url: string | null;
  // The Deepgram opt-in gate — off by default so nothing spends money silently.
  transcribe_with_deepgram: boolean;
  // Filters multi-language <podcast:transcript> tags (default 'en').
  preferred_transcript_lang: string;
  // Cap on episodes ingested on first fetch of a new feed (default 25).
  max_backfill_episodes: number;
  // Skip Deepgram on episodes older than this; null = no cap.
  max_episode_age_days: number | null;
  // Report-watch fields. A report_watch source has neither a feed_url nor an
  // inbound_address — its URLs live in detection_config. See reportWatch.ts.
  detection_strategies: ReportDetectionStrategy[];
  detection_config: ReportDetectionConfig;
  detection_last_success_at: string | null;
  detection_consecutive_empty: number;
  redistribution_default: ReportRedistribution;
  licence_notes: string | null;
  ocr_enabled: boolean;
  ocr_page_limit: number;
  crawl_delay_seconds: number;
  max_candidates_per_run: number;
  // Set on a report_watch source that discovers one research company's filings
  // (EDGAR). Managed with the register, not on /news/sources.
  research_company_id: string | null;
  // Email source fields. slug is the plus-address suffix + URL slug;
  // inbound_address is the computed research+{slug}@<domain>; sender_allowlist
  // is the approved From addresses/domains (may be empty pre-onboarding).
  slug: string | null;
  inbound_address: string | null;
  sender_allowlist: string[];
  // Shared Rex-rubric curation fields.
  tier: NewsTier | null;
  relevance_threshold: number;
  // Link following: when on, links inside an ingested item are fetched and
  // ingested as their own news_items rows. Off by default — each followed link
  // costs a fetch plus two LLM calls.
  follow_links: boolean;
  max_followed_links: number;
  // Rules applied to a followed link's real URL: host or host-plus-path
  // prefixes. A non-empty allow list means a link must match one.
  link_allow_patterns: string[];
  link_deny_patterns: string[];
  // Per-source Jina options for followed links.
  link_extract_config: NewsLinkExtractConfig;
  last_scanned_at: string | null;
  last_status: 'success' | 'failed' | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// news_sources.link_extract_config.
export interface NewsLinkExtractConfig {
  targetSelector?: string;
  removeSelector?: string;
}

// action_config shape for a 'news_source_scan' routine. The routine scans every
// active news_sources row, so config holds only per-run limits.
export interface NewsSourceScanConfig {
  // Max feed items to consider per source per run (default 10).
  max_items_per_source?: number;
  // Only consider feed items published within this many days (default 3).
  lookback_days?: number;
}

export interface NewsSourceScanResult {
  sources_scanned: number;
  items_found: number;
  items_stored: number;
  items_skipped_duplicate: number;
  extraction_failures?: number;
  // Names of sources whose feed could not be fetched/parsed this run.
  failed_sources?: string[];
}

export interface NewsItemRecord {
  id: string;
  title: string;
  url: string;
  url_hash: string;
  // Configured source this item came from (email always; rss/podcast going forward).
  source_id: string | null;
  source_name: string;
  // Email Message-ID — idempotency key. Null for feed-ingested items.
  ingestion_ref: string | null;
  // Real "view in browser"/original link, distinct from the synthetic url (email).
  canonical_url: string | null;
  // og:image/twitter:image scraped from the source page. Null for email-sourced
  // items (newsletter body) and when the scrape found nothing.
  image_url: string | null;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  body_markdown: string | null;
  summary: string | null;
  key_points: KeyPoint[];
  category: NewsCategory;
  topic_tags: string[];
  australian_relevance: boolean;
  relevance_score: number | null;
  // Rex rubric output.
  relevance_reasoning: string | null;
  curator_notes: string | null;
  rex_metadata: Record<string, unknown>;
  has_pdf_attachment: boolean;
  attachment_count: number;
  status: NewsStatus;
  knowledge_item_id: string | null;
  ingested_by: string;
  routine_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewsIngestResult {
  category: NewsCategory;
  items_found: number;
  items_stored: number;
  items_skipped_duplicate: number;
  // Stories the extractor judged as not Bitcoin- AND not AU-relevant; dropped
  // before insert so they never reach the dashboard or vector index.
  items_filtered_irrelevant?: number;
  // Rows inserted with status='extraction_failed' because the LLM call could
  // not produce a valid structured response after one retry.
  extraction_failures?: number;
  // Candidates that made it past dedup/filtering but whose insert into
  // news_items errored (e.g. a schema mismatch) — distinct from a duplicate.
  items_insert_failed?: number;
  failed_urls?: string[];
  // True when the LLM judge call failed or returned nothing — the run curated
  // zero stories by design rather than falling back to raw Tavily ranking.
  judge_failed?: boolean;
  // Short reason captured when judge_failed=true, for operator diagnostics.
  judge_failure_reason?: string;
}
