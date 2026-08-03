// Report Ingestion — types for the report_watch source type, its discovery
// configuration, and the acquired artefact.
// Spec: docs/features/html-pdf-monitoring/html-pdf-monitoring.md
//
// The DB constrains every discriminator here with a CHECK (detection strategy
// names live in code only). `detection_config` is JSONB rather than columns
// because the three strategies share almost nothing structurally — the same
// argument as EcosystemWatchConfig.

// ── Discovery ──────────────────────────────────────────────────────────────

// Selects the discovery adapter. Tried in the order configured on the source;
// the first to return candidates wins and the rest are not run.
export const ReportDetectionStrategy = {
  RSS:        'rss',
  SITEMAP:    'sitemap',
  INDEX_PAGE: 'index_page',
} as const;
export type ReportDetectionStrategy =
  (typeof ReportDetectionStrategy)[keyof typeof ReportDetectionStrategy];

// How a candidate URL came to be known. Wider than the strategy list: a URL can
// also be pasted by a director or arrive as an email attachment.
export const ReportDiscoveryMethod = {
  RSS:              'rss',
  SITEMAP:          'sitemap',
  INDEX_PAGE:       'index_page',
  MANUAL:           'manual',
  EMAIL_ATTACHMENT: 'email_attachment',
} as const;
export type ReportDiscoveryMethod =
  (typeof ReportDiscoveryMethod)[keyof typeof ReportDiscoveryMethod];

export interface RssDetectionConfig {
  feed_url: string;
}

export interface SitemapDetectionConfig {
  sitemap_url: string;
  /** Keep only paths starting with this prefix, e.g. '/reports/'. */
  path_prefix?: string;
  path_exclude?: string[];
}

export interface IndexPageDetectionConfig {
  index_url: string;
  /** CSS selector for the repeating card/row. */
  item_selector: string;
  link_selector?: string;
  title_selector?: string;
  date_selector?: string;
  /**
   * The common pattern where the index links to a landing page and the PDF sits
   * one hop further in. Acquisition follows exactly one hop, no more.
   */
  follow_to_pdf?: boolean;
  pdf_link_selector?: string;
}

/** Regex strings applied to the normalised URL, after strategy-specific filtering. */
export interface ReportUrlFilters {
  must_match?: string[];
  must_not_match?: string[];
}

export interface ReportDetectionConfig {
  rss?: RssDetectionConfig;
  sitemap?: SitemapDetectionConfig;
  index_page?: IndexPageDetectionConfig;
  url_filters?: ReportUrlFilters;
}

// ── Candidates ─────────────────────────────────────────────────────────────

export const ReportCandidateStatus = {
  NEW:       'new',
  QUEUED:    'queued',
  FETCHING:  'fetching',
  ACQUIRED:  'acquired',
  SKIPPED:   'skipped',
  FAILED:    'failed',
  DUPLICATE: 'duplicate',
} as const;
export type ReportCandidateStatus =
  (typeof ReportCandidateStatus)[keyof typeof ReportCandidateStatus];

export const ReportSkipReason = {
  FILTER_MISMATCH:   'filter_mismatch',
  WRONG_CONTENT_TYPE: 'wrong_content_type',
  TOO_LARGE:         'too_large',
  ROBOTS_DISALLOWED: 'robots_disallowed',
  ALREADY_ACQUIRED:  'already_acquired',
  MANUAL_REJECT:     'manual_reject',
} as const;
export type ReportSkipReason = (typeof ReportSkipReason)[keyof typeof ReportSkipReason];

export interface ReportCandidateRecord {
  id: string;
  source_id: string;
  url: string;
  url_hash: string;
  raw_url: string;
  discovery_method: ReportDiscoveryMethod;
  title_hint: string | null;
  published_at_hint: string | null;
  status: ReportCandidateStatus;
  skip_reason: ReportSkipReason | null;
  http_status: number | null;
  etag: string | null;
  last_modified: string | null;
  content_type: string | null;
  content_length: number | null;
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  report_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

// ── Reports ────────────────────────────────────────────────────────────────

export const ReportType = {
  QUARTERLY:     'quarterly',
  ANNUAL:        'annual',
  RESEARCH_NOTE: 'research_note',
  WHITEPAPER:    'whitepaper',
  MARKET_UPDATE: 'market_update',
  REGULATORY:    'regulatory',
  SURVEY:        'survey',
  OTHER:         'other',
} as const;
export type ReportType = (typeof ReportType)[keyof typeof ReportType];

export const ReportFileFormat = { PDF: 'pdf', HTML: 'html' } as const;
export type ReportFileFormat = (typeof ReportFileFormat)[keyof typeof ReportFileFormat];

export const ReportExtractionMethod = {
  PDF_TEXT_LAYER: 'pdf_text_layer',
  OCR:            'ocr',
  HTML_JINA:      'html_jina',
  MANUAL:         'manual',
} as const;
export type ReportExtractionMethod =
  (typeof ReportExtractionMethod)[keyof typeof ReportExtractionMethod];

export const ReportExtractionQuality = {
  GOOD:    'good',
  PARTIAL: 'partial',
  FAILED:  'failed',
} as const;
export type ReportExtractionQuality =
  (typeof ReportExtractionQuality)[keyof typeof ReportExtractionQuality];

/**
 * What may be done with a report's text downstream. Carried on every retrieved
 * segment so a restriction is never lost between retrieval and drafting — the
 * failure mode being prevented is Charlie lifting three paragraphs of a
 * publisher's prose into a LinkedIn post.
 */
export const ReportRedistribution = {
  INTERNAL_ONLY:    'internal_only',
  QUOTABLE:         'quotable',
  CLIENT_SHAREABLE: 'client_shareable',
} as const;
export type ReportRedistribution =
  (typeof ReportRedistribution)[keyof typeof ReportRedistribution];

export const ReportStatus = {
  INGESTING:    'ingesting',
  INGESTED:     'ingested',
  NEEDS_REVIEW: 'needs_review',
  ARCHIVED:     'archived',
} as const;
export type ReportStatus = (typeof ReportStatus)[keyof typeof ReportStatus];

export const REPORT_REDISTRIBUTION_LABELS: Record<ReportRedistribution, string> = {
  internal_only:    'Internal only',
  quotable:         'Quotable',
  client_shareable: 'Client shareable',
};

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  quarterly:     'Quarterly',
  annual:        'Annual',
  research_note: 'Research note',
  whitepaper:    'Whitepaper',
  market_update: 'Market update',
  regulatory:    'Regulatory',
  survey:        'Survey',
  other:         'Report',
};

/** The deterministic arithmetic behind extraction_quality. Never a judgement. */
export interface ReportExtractionMetrics {
  chars_per_page: number;
  alpha_ratio: number;
  empty_page_count: number;
  ocr_pages: number;
  page_count: number;
}

export interface ReportRecord {
  id: string;
  source_id: string | null;
  candidate_id: string | null;
  news_item_id: string | null;
  title: string;
  publisher: string | null;
  report_type: ReportType;
  published_at: string | null;
  published_at_source: 'pdf_metadata' | 'scraped' | 'http_last_modified' | null;
  source_url: string;
  canonical_url: string | null;
  file_format: ReportFileFormat;
  storage_path: string | null;
  file_name: string | null;
  file_size_bytes: number | null;
  content_hash: string;
  page_count: number | null;
  word_count: number | null;
  body: string | null;
  extraction_method: ReportExtractionMethod | null;
  extraction_quality: ReportExtractionQuality | null;
  extraction_metrics: Partial<ReportExtractionMetrics>;
  ocr_used: boolean;
  revision_of_report_id: string | null;
  superseded_at: string | null;
  redistribution: ReportRedistribution;
  licence_notes: string | null;
  curator_note: string | null;
  tags: string[];
  status: ReportStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Source configuration (the report_watch columns on news_sources) ────────

export interface ReportWatchSourceConfig {
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
}

// ── Routine (action_type = 'report_watch_scan') ────────────────────────────

export interface ReportWatchScanConfig {
  /** Per-run cap on candidates ACQUIRED across all sources. Default 10. */
  max_acquisitions_per_run?: number;
}

export interface ReportWatchScanResult {
  sources_scanned: number;
  candidates_found: number;
  candidates_new: number;
  reports_acquired: number;
  reports_duplicate: number;
  reports_failed: number;
  segments_embedded: number;
  news_items_created: number;
  /** Names of sources whose discovery run errored this tick. */
  failed_sources: string[];
  /** Sources that returned zero candidates — the silent-failure signal. */
  empty_sources: string[];
}

// ── Health view (v_report_watch_health) ───────────────────────────────────

export interface ReportWatchHealthRow {
  source_id: string;
  name: string;
  is_active: boolean;
  detection_strategies: string[];
  detection_last_success_at: string | null;
  detection_consecutive_empty: number;
  days_since_candidate: number | null;
  candidates_30d: number;
  acquired_30d: number;
  failed_total: number;
  latest_report_published_at: string | null;
}

/** Simon alerts above these. Matches the spec's morning-briefing thresholds. */
export const REPORT_WATCH_EMPTY_RUNS_ALERT = 5;
export const REPORT_WATCH_STALE_DAYS_ALERT = 45;
