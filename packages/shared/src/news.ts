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
  NEW:      'new',
  REVIEWED: 'reviewed',
  ARCHIVED: 'archived',
  PROMOTED: 'promoted',
} as const;
export type NewsStatus = (typeof NewsStatus)[keyof typeof NewsStatus];

export const NEWS_CATEGORY_LABELS: Record<NewsCategory, string> = {
  regulatory:    'Regulatory',
  corporate:     'Corporate',
  macro:         'Macro',
  international: 'International',
};

export interface NewsIngestionConfig {
  category: NewsCategory;
  queries: string[];
  max_results_per_query: number;
  // Hard cap on stories ingested per run after the LLM judge ranks the pool.
  max_curated?: number;
  search_depth?: 'basic' | 'advanced';
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
}
