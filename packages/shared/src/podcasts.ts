// ============================================================
// Podcast ingestion — types and contracts
// ============================================================
// See docs/podcast-ingestion-spec.md. Episodes live in podcast_episodes;
// embedded transcript chunks live in transcript_segments.

import type { NewsCategory } from './news.js';

// Lifecycle of an episode's transcript:
//   pending → resolving → available            (feed tag or YouTube hit)
//   pending → resolving → transcribing → available   (Deepgram, resolved by webhook)
//                       → skipped              (no free transcript + Deepgram off)
//                       → failed               (all sources errored)
export const TranscriptStatus = {
  PENDING:      'pending',
  RESOLVING:    'resolving',
  TRANSCRIBING: 'transcribing',
  AVAILABLE:    'available',
  FAILED:       'failed',
  SKIPPED:      'skipped',
} as const;
export type TranscriptStatus = (typeof TranscriptStatus)[keyof typeof TranscriptStatus];

// Where a resolved transcript came from.
export const TranscriptSource = {
  FEED_TAG: 'feed_tag',
  YOUTUBE:  'youtube',
  DEEPGRAM: 'deepgram',
  MANUAL:   'manual',
} as const;
export type TranscriptSource = (typeof TranscriptSource)[keyof typeof TranscriptSource];

export const TranscriptFormat = {
  JSON: 'json',
  VTT:  'vtt',
  SRT:  'srt',
  HTML: 'html',
  TEXT: 'text',
} as const;
export type TranscriptFormat = (typeof TranscriptFormat)[keyof typeof TranscriptFormat];

// How the episode entered the system.
export const IngestionOrigin = {
  FEED:   'feed',
  BRIEF:  'brief',
  MANUAL: 'manual',
} as const;
export type IngestionOrigin = (typeof IngestionOrigin)[keyof typeof IngestionOrigin];

// Lifecycle of an episode's synthesised brief (episode intelligence, Phase 1).
// The draft text lives in episode_summary throughout; this status is the
// publish-wall: only 'approved' is client-visible. 'generating' and 'failed' are
// the durable in-flight/failure signals — the pass runs on the agent server
// async, so the web page reads these to survive a reload instead of reverting to
// the bare "Generate brief" button.
//   none → generating       (director clicks Generate; web writes the request)
//   generating → proposed    (roger drafts, lex reviews — director-only)
//   generating → failed      (the pass could not produce a brief; retry allowed)
//   proposed → approved      (a human approves at the wall)
//   proposed → none          (a human rejects; draft is cleared)
export const SummaryStatus = {
  NONE:       'none',
  GENERATING: 'generating',
  PROPOSED:   'proposed',
  APPROVED:   'approved',
  FAILED:     'failed',
} as const;
export type SummaryStatus = (typeof SummaryStatus)[keyof typeof SummaryStatus];

// Lex's structured verdict on a proposed summary, stored on the episode row so
// the director sees the compliance signal at the approval wall. Mirrors the
// content-review ComplianceVerdict shape in apps/agents compliance.
export interface SummaryComplianceVerdict {
  passes: boolean;
  flags: { quote: string; issue: string }[];
  rationale: string;
  suggested_rewrite: string | null;
}

// One key takeaway from an episode (episode intelligence, Phase 2). Anchored to
// the moment it is discussed so the episode page can deep-link into the media;
// start_seconds is null when the transcript carried no timestamps. Rides the same
// summary_status publish-wall as the summary — client-visible only once approved.
export interface EpisodeTakeaway {
  text: string;
  start_seconds: number | null;
}

// One chapter of an episode (episode intelligence, Phase 3): a short section
// title and the second it begins, so the episode page can offer a chapter rail
// that jumps into the media. start_seconds is always set — anchorless chapters
// are dropped at generation. Rides the same summary_status publish-wall.
export interface EpisodeChapter {
  title: string;
  start_seconds: number;
}

// Rex's rubric working: the three dimension scores, the derived flags, the candid
// internal reasoning, and the rubric version. Stored on the episode (mirrors
// news_items.rex_metadata) so the director can see how a relevance_score was
// reached. Not client-facing.
export interface EpisodeRelevanceMetadata {
  dimension_scores: { material: number; novelty: number; citation: number };
  relevance_reasoning: string;
  flags: string[];
  rubric_version: string;
}

// One ingested episode. Mirrors the podcast_episodes table (embedding columns
// excluded — those live on transcript_segments).
export interface PodcastEpisode {
  id: string;
  slug: string;
  source_id: string | null;
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
  transcript_status: TranscriptStatus;
  transcript_source: TranscriptSource | null;
  transcript_format: TranscriptFormat | null;
  transcript_lang: string | null;
  transcript_text: string | null;
  transcript_raw_url: string | null;
  has_timestamps: boolean;
  deepgram_request_id: string | null;
  transcript_error: string | null;
  ingestion_origin: IngestionOrigin;
  curator_note: string | null;
  topic_tags: string[];
  transcript_fetched_at: string | null;
  embedded_at: string | null;
  // Episode intelligence (summary — Phase 1; takeaways — Phase 2). The drafts
  // live on the row the whole time; summary_status gates whether they are
  // client-visible. key_takeaways is always an array (defaults to [] in the DB).
  episode_summary: string | null;
  key_takeaways: EpisodeTakeaway[];
  chapters: EpisodeChapter[];
  summary_status: SummaryStatus;
  summary_lex_verdict: SummaryComplianceVerdict | null;
  summary_generated_at: string | null;
  summary_approved_at: string | null;
  summary_approved_by: string | null;
  // Episode relevance (Q3 resolution: podcast-tuned fork of Rex's news rubric,
  // scored from the brief). Director/ops metadata — NOT gated by summary_status.
  // Null until the intelligence pass scores the episode (or if scoring failed).
  relevance_score: number | null;
  category: NewsCategory | null;
  relevance_metadata: EpisodeRelevanceMetadata | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// One card in the client-safe library browse view. Mirrors the v_episode_library
// view (approved episodes only, no ops internals) — the Q1/D2 reader boundary.
export interface EpisodeLibraryCard {
  id: string;
  slug: string;
  title: string;
  published_at: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  youtube_url: string | null;
  audio_url: string | null;
  episode_summary: string | null;
  key_takeaways: EpisodeTakeaway[];
  chapters: EpisodeChapter[];
  category: NewsCategory | null;
  relevance_score: number | null;
  topic_tags: string[];
  source_name: string | null;
}

// A "briefing pack" (podcast-pages-review B4): a named, ordered set of episodes
// with a short intro. Mirrors the podcast_collections table. Manual assembly —
// no approval gate (see the Open-questions resolution).
export interface PodcastCollection {
  id: string;
  slug: string;
  title: string;
  intro: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// One episode's membership in a collection (podcast_collection_items). Ordered
// within the pack by `position`.
export interface PodcastCollectionItem {
  id: string;
  collection_id: string;
  episode_id: string;
  position: number;
  created_at: string;
}

// A collection as shown on the index: the pack plus how many episodes it holds.
export interface PodcastCollectionCard extends PodcastCollection {
  episode_count: number;
}

// One member episode as rendered on the collection detail page: the item row
// (id + position, so it can be removed/reordered) joined to its episode's
// display fields. Membership is drawn from the client-safe v_episode_library
// (approved episodes only), so a pack — the eventual client hand-off unit —
// never carries an unapproved brief or an ops internal.
export interface PodcastCollectionEpisode {
  item_id: string;
  position: number;
  episode_id: string;
  slug: string;
  title: string;
  source_name: string | null;
  image_url: string | null;
  duration_seconds: number | null;
  published_at: string | null;
  relevance_score: number | null;
  category: NewsCategory | null;
  episode_summary: string | null;
}

// One episode as offered in the "add episode" picker: the client-safe library
// episodes not already in the pack. Enough to identify it, nothing operational.
export interface PodcastCollectionPickerEpisode {
  id: string;
  slug: string;
  title: string;
  source_name: string | null;
  published_at: string | null;
}

// One embedded transcript chunk (embedding omitted from the read surface, like
// NewsItemRecord). start/end seconds are null when the source had no timestamps.
export interface TranscriptSegment {
  id: string;
  episode_id: string;
  segment_index: number;
  start_seconds: number | null;
  end_seconds: number | null;
  speaker: string | null;
  content: string;
  token_count: number | null;
  created_at: string;
}

// A one-off ingestion brief Simon hands Archie: "transcribe this, because …".
export interface PodcastBrief {
  audio_url?: string;
  youtube_url?: string;
  title?: string;
  why: string;
}
