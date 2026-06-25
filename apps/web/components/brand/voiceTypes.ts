// Local row shapes for the Brand Hub voice UI. Mirrors the brand_voice /
// voice_snippets columns. (Web doesn't import @platform/voice, which carries
// the service-role DB client; these structural types are duplicated here.)

export interface VoiceProfile {
  persona?: string;
  tone_attributes?: string[];
  vocabulary_do?: string[];
  vocabulary_avoid?: string[];
  signature_devices?: string[];
  format_notes?: string;
}

export interface BrandVoiceRow {
  id: string;
  profile: VoiceProfile;
  mission_summary: string | null;
  bitcoin_capitalisation_rule: string | null;
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
