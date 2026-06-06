// ============================================================
// News aggregation — types and contracts
// ============================================================

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

// A user-curated publication scanned via its RSS/Atom feed. Managed from the
// web app (/news/sources) or by Simon. Distinct from the keyword-search
// NewsIngestionConfig — sources name specific publications to watch.
export type NewsSourceType = 'rss' | 'podcast' | 'youtube';

export interface NewsSourceRecord {
  id: string;
  name: string;
  site_url: string | null;
  // Nullable since 'youtube' sources have no RSS/podcast feed URL.
  feed_url: string | null;
  is_active: boolean;
  // Discriminator. 'rss' is the legacy default; 'podcast'/'youtube' are new.
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
  last_scanned_at: string | null;
  last_status: 'success' | 'failed' | null;
  last_error: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
  source_name: string;
  published_at: string | null;
  fetched_at: string;
  body_markdown: string | null;
  summary: string | null;
  key_points: string[];
  category: NewsCategory;
  topic_tags: string[];
  australian_relevance: boolean;
  relevance_score: number | null;
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
  failed_urls?: string[];
  // True when the LLM judge call failed or returned nothing — the run curated
  // zero stories by design rather than falling back to raw Tavily ranking.
  judge_failed?: boolean;
  // Short reason captured when judge_failed=true, for operator diagnostics.
  judge_failure_reason?: string;
}
