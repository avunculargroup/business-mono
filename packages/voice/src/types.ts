// Shared shapes for the voice resolver. The `VoiceProfile` shape is identical
// for the company canon (`brand_voice.profile`) and each account override
// (`social_accounts.voice_profile`) — that sameness is what lets one merge,
// one editor, and one validator serve both. See docs/brand-voice-migration-spec.md.

export interface VoiceProfile {
  persona?: string;
  tone_attributes?: string[];
  vocabulary_do?: string[];
  vocabulary_avoid?: string[];
  signature_devices?: string[];
  format_notes?: string;
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
