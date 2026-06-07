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
export const RoutineActionType = {
  RESEARCH_DIGEST:   'research_digest',
  MONITOR_CHANGE:    'monitor_change',
  NEWS_INGEST:       'news_ingest',
  NEWS_SOURCE_SCAN:  'news_source_scan',
  NEWSLETTER:        'newsletter',
  PODCAST_INGEST:    'podcast_ingest',
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

export type RoutineActionConfig =
  | ({ action_type: typeof RoutineActionType.RESEARCH_DIGEST } & ResearchDigestConfig)
  | ({ action_type: typeof RoutineActionType.MONITOR_CHANGE } & MonitorChangeConfig)
  | ({ action_type: typeof RoutineActionType.NEWSLETTER } & NewsletterConfig)
  | ({ action_type: typeof RoutineActionType.PODCAST_INGEST } & PodcastIngestConfig);

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
