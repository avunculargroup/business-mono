// Shared shapes for the voice resolver. The `VoiceProfile` shape is identical
// for the company canon (`brand_voice.profile`) and each account override
// (`social_accounts.voice_profile`) — that sameness is what lets one merge,
// one editor, and one validator serve both. See docs/brand-voice-migration-spec.md.

export const REGISTER_OPTIONS = ['formal', 'semi-formal', 'conversational', 'casual'] as const;
export type Register = (typeof REGISTER_OPTIONS)[number];

export const PARAGRAPHING_OPTIONS = ['single-block', 'short-paragraphs', 'platform-default'] as const;
export type Paragraphing = (typeof PARAGRAPHING_OPTIONS)[number];

export const HASHTAG_USE_OPTIONS = ['none', 'sparingly', 'platform-default'] as const;
export type HashtagUse = (typeof HASHTAG_USE_OPTIONS)[number];

export const EMOJI_USE_OPTIONS = ['none', 'sparingly', 'platform-default'] as const;
export type EmojiUse = (typeof EMOJI_USE_OPTIONS)[number];

export const THREAD_STYLE_OPTIONS = ['platform-default', 'single-only'] as const;
export type ThreadStyle = (typeof THREAD_STYLE_OPTIONS)[number];

/**
 * Structured per-property format configuration. Stored under `VoiceProfile.format`.
 * Each field is independently inherited (account wins per-field; company fills gaps).
 * Preferred over the legacy free-text `format_notes` string when present.
 */
export interface FormatConfig {
  word_count_min?: number;
  word_count_max?: number;
  /** Character-based length floor — mainly for X, which counts characters. */
  char_count_min?: number;
  /** Character-based length ceiling. A soft account limit below the platform hard ceiling. */
  char_count_max?: number;
  register?: Register;
  paragraphing?: Paragraphing;
  hashtag_use?: HashtagUse;
  emoji_use?: EmojiUse;
  /** `single-only` forces single posts on X (never threads). Only bites on twitter_x. */
  thread_style?: ThreadStyle;
}

export interface VoiceProfile {
  persona?: string;
  tone_attributes?: string[];
  vocabulary_do?: string[];
  vocabulary_avoid?: string[];
  signature_devices?: string[];
  /** @deprecated Use `format` instead. Still rendered as a fallback when `format` is absent. */
  format_notes?: string;
  format?: FormatConfig;
}

/**
 * Company-level topic & positioning policy. Lives on the canon (`brand_voice`)
 * only — not on a per-account `voice_profile`, because what BTS will and won't
 * comment on publicly is a company stance, not an account's voice. Always
 * applied; surfaced into every generation so topic guidance is data, not
 * hard-coded prompt text.
 */
export interface ContentPolicy {
  /** Topics we comment on publicly. */
  topics_endorsed?: string[];
  /** Topics we never post about. */
  topics_avoided?: string[];
  /** Thought leaders / companies we align with. */
  aligned_voices?: string[];
  /** Voices we respectfully disagree with. */
  contrarian_views?: string[];
}

export type Platform = 'linkedin' | 'twitter_x';

export type SnippetType =
  | 'phrase'
  | 'opener'
  | 'closer'
  | 'transition'
  | 'paragraph'
  | 'full_post'
  | 'cta';

/** A row returned by the `match_voice_snippets` RPC. */
export interface VoiceSnippet {
  id: string;
  social_account_id: string | null;
  snippet_type: SnippetType;
  body: string;
  curator_note: string | null;
  platform: Platform | null;
  topic_tags: string[];
  is_starred: boolean;
  /** Raw cosine similarity to the query (0..1). */
  similarity: number;
  /** Similarity plus the starred bonus — the value rows are ranked by. */
  score: number;
}

/** The company-canon row (`brand_voice`). */
export interface BrandVoice {
  profile: VoiceProfile;
  mission_summary: string | null;
  bitcoin_capitalisation_rule: string | null;
  /** Canon topic & positioning policy. Empty object when none set. */
  content_policy: ContentPolicy;
  version: string;
}

/** The fields of a `social_accounts` row the resolver needs. */
export interface SocialAccountVoice {
  id: string;
  platform: Platform;
  voice_profile: VoiceProfile;
}

/**
 * The complete voice context an agent needs for one generation: the merged
 * profile, the always-on Bitcoin rule, the company mission, and the retrieved
 * exemplars — assembled in a single call so an agent gets everything in one hop.
 */
export interface ResolvedVoiceContext {
  /** Merged umbrella + override profile. */
  profile: VoiceProfile;
  /** Always applied, never overridable. Null only if the canon has none set. */
  bitcoinCapitalisationRule: string | null;
  /** One-paragraph statement of what BTS sounds like, from the company canon. */
  missionSummary: string | null;
  /** Canon topic & positioning policy — company-level, always applied. */
  contentPolicy: ContentPolicy;
  /** Top-N exemplars by similarity to the query (empty when no query given). */
  snippets: VoiceSnippet[];
}
