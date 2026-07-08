import type { AgentName } from './types.js';
import type { ResearchSource } from './types.js';

// Schedule cadence for a routine.
export const RoutineFrequency = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  FORTNIGHTLY: 'fortnightly',
} as const;
export type RoutineFrequency = (typeof RoutineFrequency)[keyof typeof RoutineFrequency];

// What kind of work a routine performs.
//  - research_digest: Rex pulls the latest on a topic; full digest is surfaced.
//  - monitor_change: Rex detects whether the topic's state has changed vs last run.
//  - news_ingest: Rex fetches fresh news articles into the news_items feed.
//  - news_source_scan: Rex scans the user-curated news_sources feeds for new articles.
//  - newsletter: launches the suspendable newsletter workflow (Rex selects, Charlie
//    drafts, editorial reviews; suspends for human approval at two Signal gates).
//  - podcast_ingest: Archie scans podcast news_sources, ingests new episodes, and
//    resolves each transcript via the waterfall (feed tag → YouTube → Deepgram).
//  - news_curation: Charlie/editor curate the day's best news_items + podcast_episodes
//    into a dashboard tile (mood summary, ≤6 ranked stories, headline image, more-news link).
//  - indicator_poll: Simon polls each due economic_indicator via its provider adapter
//    (FRED/RBA), upserts observations with revision handling, and proposes a content beat
//    (Charlie draft) on a qualifying new print.
//  - onchain_poll: Simon polls each active on-chain indicator via its provider adapter
//    (mempool/coinmetrics/coingecko/alternative_me), upserts raw observations with
//    revision handling, lets the views derive the rest, and proposes a
//    (compliance-sensitive) content beat on a Hash-Ribbons signal change, an MVRV band
//    cross, or a large hash-rate drop.
//  - social_post_from_news: per-founder routine. The editor picks the day's news story
//    that best fits the founder's voice and the post form (share-with-context vs teach),
//    Charlie drafts a LinkedIn + an X post in the founder's voice, Lex classifies advice
//    risk, both land in content_items as drafts, and the founder is emailed the drafts.
//  - market_report: Simon reads the already-stored on-chain (v_onchain_dashboard) and
//    macro (v_indicator_latest) views and emails the team a daily snapshot — current
//    values, day-over-day/period change, and neutral signals (hash ribbons, MVRV band).
//    Block height, BTC/AUD price, and the Fear & Greed Index get their own "Bitcoin"
//    section fetched LIVE at send time (not from the last onchain_poll run), with the
//    delta computed against the most recently stored observation.
//    A short (≤50-word) intro is written by the internal marketAnalyst agent from the
//    snapshot + several days of recent history — best-effort, so a failure just drops
//    the intro. Otherwise reads only (plus the three live fetches), writes nothing
//    beyond the audit trail.
export const RoutineActionType = {
  RESEARCH_DIGEST:       'research_digest',
  MONITOR_CHANGE:        'monitor_change',
  NEWS_INGEST:           'news_ingest',
  NEWS_SOURCE_SCAN:      'news_source_scan',
  NEWSLETTER:            'newsletter',
  PODCAST_INGEST:        'podcast_ingest',
  NEWS_CURATION:         'news_curation',
  INDICATOR_POLL:        'indicator_poll',
  ONCHAIN_POLL:          'onchain_poll',
  SOCIAL_POST_FROM_NEWS: 'social_post_from_news',
  MARKET_REPORT:         'market_report',
} as const;
export type RoutineActionType = (typeof RoutineActionType)[keyof typeof RoutineActionType];

export const RoutineStatus = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RUNNING: 'running',
} as const;
export type RoutineStatus = (typeof RoutineStatus)[keyof typeof RoutineStatus];

export interface ResearchDigestConfig {
  subject: string;
  context?: string;
  search_queries: string[];
  archive_sources: boolean;
  max_sources?: number;
}

export interface MonitorChangeConfig {
  subject: string;
  context?: string;
  search_queries: string[];
  notify_signal: boolean;
  notify_agent?: string | null;
  last_digest?: string | null;
}

// Lookback window for the newsletter's internal-content retrieval.
export type NewsletterTimeRange = 'week' | 'fortnight' | 'month';

export interface NewsletterConfig {
  time_range: NewsletterTimeRange;
  story_count: number;       // 3–8
  target_word_count: number; // per story
  audience_context?: string;
  // When true the routine only fires on the first Monday of the month and skips
  // if a newsletter run already exists for the current calendar month.
  monthly_guard?: boolean;
}

// action_config shape for a 'podcast_ingest' routine. Like news_source_scan, the
// routine scans every active podcast news_sources row, so config holds only
// per-run limits — the per-feed knobs (Deepgram opt-in, backfill cap, language)
// live on news_sources.
export interface PodcastIngestConfig {
  // Max feed items to consider per source per run (default 25).
  max_items_per_source?: number;
  // Only consider feed items published within this many days (default 14).
  lookback_days?: number;
}

export interface PodcastIngestResult {
  sources_scanned: number;
  episodes_found: number;
  episodes_new: number;
  transcripts_available: number;
  transcripts_transcribing: number;
  transcripts_skipped: number;
  transcripts_failed: number;
  segments_embedded: number;
  // Names of sources whose feed could not be fetched/parsed this run.
  failed_sources?: string[];
}

// action_config shape for a 'news_curation' routine. Curates the day's best
// news_items + podcast_episodes into a dashboard tile.
export interface NewsCurationConfig {
  // Max items to feature on the tile (default 6, hard-capped at 6).
  max_stories?: number;
  // Only consider items fetched/published within this many hours (default 24).
  lookback_hours?: number;
  // Where the tile's "More news" footer link points (default '/news').
  more_news_url?: string;
}

// One curated item on the news_curation tile — either a news article or a podcast episode.
export interface NewsCurationStory {
  kind: 'news' | 'podcast';
  id: string;
  title: string;
  url: string;
  source_name: string;
  category: string;
  image_url?: string;
}

// Structured payload persisted under routines.last_result.metadata for news_curation.
export interface NewsCurationResult {
  mood_summary: string;
  stories: NewsCurationStory[];
  more_news_url: string;
  headline_image_url?: string;
}

// action_config shape for an 'indicator_poll' routine. Polls economic_indicators.
export interface IndicatorPollConfig {
  // How many historical periods to pull the first time an indicator is seen,
  // so YoY and the sparkline aren't empty on day one (default 18, ~range 12–24).
  backfill_periods?: number;
}

// Structured payload persisted under routines.last_result.metadata for indicator_poll,
// and serialised into agent_activity.notes so quiet days stay on the record.
export interface IndicatorPollResult {
  indicators_polled: number;
  observations_inserted: number;
  observations_superseded: number;
  no_op: number;
  beats_proposed: number;
  // Provider/indicator labels whose fetch or parse failed this run (sweep continues).
  failed: string[];
}

// action_config shape for an 'onchain_poll' routine. Polls onchain_indicators.
export interface OnchainPollConfig {
  // How many days of history to pull the first time an indicator is seen. Hash
  // Ribbons needs 60 days of hash rate to compute, so default generously (90).
  backfill_days?: number;
}

// Structured payload persisted under routines.last_result.metadata for onchain_poll,
// and serialised into agent_activity.notes so quiet days stay on the record.
export interface OnchainPollResult {
  indicators_polled: number;
  observations_inserted: number;
  observations_superseded: number;
  no_op: number;
  beats_proposed: number;
  // Provider/indicator labels whose fetch or parse failed this run (sweep continues).
  failed: string[];
}

// action_config shape for a 'social_post_from_news' routine. One routine per
// founder (the seed creates one per founder social account owner); each run picks
// a fresh news story that fits THIS founder's voice and drafts posts for them.
export interface SocialPostFromNewsConfig {
  // The team_member whose founder social_accounts (X + LinkedIn) the posts are for.
  founder_team_member_id: string;
  // Which platforms to draft for (default both).
  platforms?: ('linkedin' | 'twitter_x')[];
  // Only consider news_items fetched within this many hours (default 24).
  lookback_hours?: number;
}

// The post form the editor chooses for a given story + founder.
export type SocialPostForm = 'share_with_context' | 'teach';

// One drafted post persisted to content_items this run.
export interface SocialPostDraft {
  contentItemId: string;
  platform: 'linkedin' | 'twitter_x';
  is_thread: boolean;
}

// Structured payload persisted under routines.last_result.metadata for social_post_from_news.
export interface SocialPostFromNewsResult {
  founder_team_member_id: string;
  founder_name: string;
  story_id: string;
  story_url: string;
  form: SocialPostForm;
  posts: SocialPostDraft[];
  // True when the founder draft email was sent successfully.
  emailed: boolean;
}

// action_config shape for a 'market_report' routine. No knobs in v1 — the report
// always reads every displayed on-chain metric and every active macro indicator.
export type MarketReportConfig = Record<string, never>;

// One indicator line in the report. Delta is direction-only prose; never good/bad.
export interface MarketReportItem {
  // Short display label, e.g. 'Hash rate', 'MVRV', 'US 10Y'.
  label: string;
  // Formatted value including unit, e.g. '3.85%', '112.40 EH/s', '5,010.00'.
  value: string;
  // Direction-only change vs the prior observation, e.g. '▲ +0.12 (+0.4%) on prior'.
  // Null when flat or when there is no prior value to compare.
  delta?: string | null;
  // A neutral state chip where the metric carries one — e.g. the Hash-Ribbons
  // signal ('neutral'|'capitulation'|'recovery') or an MVRV band label. Null otherwise.
  signal?: string | null;
  // ISO date (YYYY-MM-DD) the figure is as at, for an "as at" caption.
  as_of?: string | null;
}

export interface MarketReportSection {
  // Section heading, e.g. 'On-chain' or 'Macro'.
  heading: string;
  items: MarketReportItem[];
}

// Structured payload persisted under routines.last_result.metadata for market_report.
export interface MarketReportResult {
  sections: MarketReportSection[];
  onchain_count: number;
  macro_count: number;
  // Block height, BTC/AUD price, Fear & Greed — fetched live at send time, not
  // read from the last onchain_poll run. See runMarketReport.ts.
  bitcoin_count: number;
  // Price-derived trend/valuation metrics (moving averages, Mayer Multiple, 50d/200d
  // cross, RSI, realised volatility, drawdown) — derived in v_btc_trend.
  trend_count: number;
  // True when the report email reached at least one recipient.
  emailed: boolean;
  // The ≤50-word analyst intro, or null when it was skipped (no data, generation
  // error, or an over-length response). Best-effort — never blocks the report.
  commentary?: string | null;
}

export type RoutineActionConfig =
  | ({ action_type: typeof RoutineActionType.RESEARCH_DIGEST } & ResearchDigestConfig)
  | ({ action_type: typeof RoutineActionType.MONITOR_CHANGE } & MonitorChangeConfig)
  | ({ action_type: typeof RoutineActionType.NEWSLETTER } & NewsletterConfig)
  | ({ action_type: typeof RoutineActionType.PODCAST_INGEST } & PodcastIngestConfig)
  | ({ action_type: typeof RoutineActionType.NEWS_CURATION } & NewsCurationConfig)
  | ({ action_type: typeof RoutineActionType.INDICATOR_POLL } & IndicatorPollConfig)
  | ({ action_type: typeof RoutineActionType.ONCHAIN_POLL } & OnchainPollConfig)
  | ({ action_type: typeof RoutineActionType.SOCIAL_POST_FROM_NEWS } & SocialPostFromNewsConfig)
  | ({ action_type: typeof RoutineActionType.MARKET_REPORT } & MarketReportConfig);

// Shape persisted in routines.last_result. Action-agnostic so the dashboard tile
// can render any routine's output uniformly.
export interface RoutineResult {
  summary?: string;
  digest?: string;
  sources: ResearchSource[];
  metadata?: Record<string, unknown>;
}

export interface RoutineRow {
  id: string;
  name: string;
  description: string | null;
  agent_name: AgentName;
  action_type: RoutineActionType;
  action_config: Record<string, unknown>;
  frequency: RoutineFrequency;
  time_of_day: string;
  timezone: string;
  next_run_at: string;
  last_run_at: string | null;
  last_result: RoutineResult | null;
  last_status: RoutineStatus | null;
  last_error: string | null;
  show_on_dashboard: boolean;
  dashboard_title: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
