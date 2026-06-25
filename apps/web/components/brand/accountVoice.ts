// Inheritance helpers for the per-account (founder) voice editor. An account
// voice is the company canon plus its own overrides — these helpers compute the
// override state the UI shows and clean a profile down to just the deltas before
// saving, so canon edits keep flowing through inherited fields. Mirrors the
// merge rules in @platform/voice (account wins where set; vocabulary_avoid is
// unioned with the company bans, which are locked on an account).

import type { VoiceProfile } from './voiceTypes';

/** The profile fields an account can override, in display order. */
export const VOICE_FIELDS = [
  'persona',
  'tone_attributes',
  'vocabulary_do',
  'vocabulary_avoid',
  'signature_devices',
  'format_notes',
] as const;

export type VoiceField = (typeof VOICE_FIELDS)[number];

const STRING_FIELDS: VoiceField[] = ['persona', 'format_notes'];

function presentString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function presentArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.some((v) => typeof v === 'string' && v.trim().length > 0);
}

/** Case-insensitive membership over a list of terms. */
function includesCi(list: string[], term: string): boolean {
  const key = term.trim().toLowerCase();
  return list.some((v) => v.trim().toLowerCase() === key);
}

/**
 * The company-banned avoid words. These are locked on every account: a word the
 * company bans can't be un-banned on an account (the merge unions them), so the
 * editor renders them as non-removable chips and never stores them on the
 * account profile.
 */
export function lockedAvoidWords(company: VoiceProfile | null | undefined): string[] {
  return (company?.vocabulary_avoid ?? []).filter((w) => presentString(w));
}

/**
 * Whether a single field is overridden on the account (i.e. the account sets its
 * own value, diverging from canon). For `vocabulary_avoid` only the account's
 * OWN additions count — the inherited company bans are locked, not an override.
 */
export function isFieldOverridden(
  field: VoiceField,
  account: VoiceProfile | null | undefined,
  company: VoiceProfile | null | undefined,
): boolean {
  const value = account?.[field];
  if (field === 'vocabulary_avoid') {
    const locked = lockedAvoidWords(company);
    const own = (Array.isArray(value) ? value : []).filter(
      (w) => presentString(w) && !includesCi(locked, w),
    );
    return own.length > 0;
  }
  if (STRING_FIELDS.includes(field)) return presentString(value);
  return presentArray(value);
}

/** How many fields the account overrides — the at-a-glance count in the list. */
export function overrideCount(
  account: VoiceProfile | null | undefined,
  company: VoiceProfile | null | undefined,
): number {
  return VOICE_FIELDS.filter((f) => isFieldOverridden(f, account, company)).length;
}

/**
 * Reduce an edited account profile to just its overrides before saving:
 *   - trim strings, drop empty ones (so the field falls back to canon),
 *   - drop empty/blank array entries and empty arrays,
 *   - strip company-banned words from `vocabulary_avoid` (they're enforced via
 *     the union, never stored on the account).
 * Omitted keys keep inheritance live — a later canon edit still reaches them.
 */
export function cleanAccountProfile(
  raw: VoiceProfile,
  company: VoiceProfile | null | undefined,
): VoiceProfile {
  const out: VoiceProfile = {};
  const locked = lockedAvoidWords(company);

  if (presentString(raw.persona)) out.persona = raw.persona.trim();
  if (presentString(raw.format_notes)) out.format_notes = raw.format_notes.trim();

  const cleanList = (list: string[] | undefined) =>
    (list ?? []).map((v) => v.trim()).filter((v) => v.length > 0);

  const tone = cleanList(raw.tone_attributes);
  if (tone.length > 0) out.tone_attributes = tone;

  const vocabDo = cleanList(raw.vocabulary_do);
  if (vocabDo.length > 0) out.vocabulary_do = vocabDo;

  const devices = cleanList(raw.signature_devices);
  if (devices.length > 0) out.signature_devices = devices;

  const avoid = cleanList(raw.vocabulary_avoid).filter((w) => !includesCi(locked, w));
  if (avoid.length > 0) out.vocabulary_avoid = avoid;

  return out;
}
