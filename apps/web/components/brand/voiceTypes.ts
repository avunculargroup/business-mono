// Local row shapes for the Brand Hub voice UI. Mirrors the brand_voice /
// voice_snippets columns. (Web doesn't import @platform/voice, which carries
// the service-role DB client; these structural types are duplicated here.)

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

export interface FormatConfig {
  word_count_min?: number;
  word_count_max?: number;
  char_count_min?: number;
  char_count_max?: number;
  register?: Register;
  paragraphing?: Paragraphing;
  hashtag_use?: HashtagUse;
  emoji_use?: EmojiUse;
  thread_style?: ThreadStyle;
}

export interface VoiceProfile {
  persona?: string;
  tone_attributes?: string[];
  vocabulary_do?: string[];
  vocabulary_avoid?: string[];
  signature_devices?: string[];
  /** @deprecated Use `format` instead. Still read for display; UI no longer writes it. */
  format_notes?: string;
  format?: FormatConfig;
}

/** Canon-only topic & positioning policy (lives on brand_voice, not accounts). */
export interface ContentPolicy {
  topics_endorsed?: string[];
  topics_avoided?: string[];
  aligned_voices?: string[];
  contrarian_views?: string[];
}

export interface BrandVoiceRow {
  id: string;
  profile: VoiceProfile;
  mission_summary: string | null;
  bitcoin_capitalisation_rule: string | null;
  content_policy: ContentPolicy | null;
  version: string;
}

export type Platform = 'linkedin' | 'twitter_x';

export interface SocialAccountRow {
  id: string;
  platform: Platform;
  account_type: 'company' | 'founder';
  display_name: string;
  handle: string | null;
  profile_url: string | null;
  voice_profile: VoiceProfile;
}

export type SnippetType =
  | 'phrase'
  | 'opener'
  | 'closer'
  | 'transition'
  | 'paragraph'
  | 'full_post'
  | 'cta';

export interface VoiceSnippetRow {
  id: string;
  snippet_type: SnippetType;
  body: string;
  curator_note: string | null;
  platform: 'linkedin' | 'twitter_x' | null;
  topic_tags: string[];
  is_starred: boolean;
  social_account_id: string | null;
}

export const SNIPPET_TYPES: SnippetType[] = [
  'phrase',
  'opener',
  'closer',
  'transition',
  'paragraph',
  'full_post',
  'cta',
];
