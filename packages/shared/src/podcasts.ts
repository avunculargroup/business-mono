// ============================================================
// Podcast ingestion — types and contracts
// ============================================================
// See docs/podcast-ingestion-spec.md. Episodes live in podcast_episodes;
// embedded transcript chunks live in transcript_segments.

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
// publish-wall: only 'approved' is client-visible.
//   none → proposed        (roger drafts, lex reviews — director-only)
//   proposed → approved     (a human approves at the wall)
//   proposed → none         (a human rejects; draft is cleared)
export const SummaryStatus = {
  NONE:     'none',
  PROPOSED: 'proposed',
  APPROVED: 'approved',
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
  // Episode intelligence (Phase 1: summary). The draft lives in episode_summary
  // the whole time; summary_status gates whether it is client-visible.
  episode_summary: string | null;
  summary_status: SummaryStatus;
  summary_lex_verdict: SummaryComplianceVerdict | null;
  summary_generated_at: string | null;
  summary_approved_at: string | null;
  summary_approved_by: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
