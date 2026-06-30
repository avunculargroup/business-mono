import type { FormatConfig, VoiceProfile } from './types.js';

// Umbrella + override merge. The company canon is the baseline; the account
// profile takes precedence on any overlapping key and the canon fills gaps.
// Two deliberate exceptions:
//   * `vocabulary_avoid` is UNIONED, not overridden — a word the company bans
//     stays banned even if an account profile doesn't repeat it.
//   * the Bitcoin capitalisation rule is handled outside the profile (always
//     applied, never overridable) — see resolve.ts.

/** A string field counts as "set" only when it has non-whitespace content. */
function presentString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** An array field counts as "set" only when it has at least one element. */
function presentArray(value: string[] | undefined): value is string[] {
  return Array.isArray(value) && value.length > 0;
}

/** Case-insensitive de-dupe that preserves first-seen order. */
function unionDistinct(a: string[] | undefined, b: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of [...(a ?? []), ...(b ?? [])]) {
    const key = item.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Merge the company canon profile (umbrella) with an account profile (override).
 * Account values win where set; the canon fills the rest. `vocabulary_avoid` is
 * the one unioned field. Pass `account = null` for non-account content (a
 * newsletter, a blog post) to get the company canon unchanged.
 */
export function mergeVoice(
  company: VoiceProfile | null | undefined,
  account: VoiceProfile | null | undefined,
): VoiceProfile {
  const base = company ?? {};
  const over = account ?? {};

  const merged: VoiceProfile = {};

  // Scalar / replace-on-overlap fields: account wins when set, else company.
  const persona = presentString(over.persona) ? over.persona : base.persona;
  if (presentString(persona)) merged.persona = persona;

  const formatNotes = presentString(over.format_notes) ? over.format_notes : base.format_notes;
  if (presentString(formatNotes)) merged.format_notes = formatNotes;

  // List fields that replace on overlap (account wins wholesale when set).
  const toneAttributes = presentArray(over.tone_attributes)
    ? over.tone_attributes
    : base.tone_attributes;
  if (presentArray(toneAttributes)) merged.tone_attributes = toneAttributes;

  const vocabularyDo = presentArray(over.vocabulary_do) ? over.vocabulary_do : base.vocabulary_do;
  if (presentArray(vocabularyDo)) merged.vocabulary_do = vocabularyDo;

  const signatureDevices = presentArray(over.signature_devices)
    ? over.signature_devices
    : base.signature_devices;
  if (presentArray(signatureDevices)) merged.signature_devices = signatureDevices;

  // Unioned field: company bans always survive.
  const vocabularyAvoid = unionDistinct(base.vocabulary_avoid, over.vocabulary_avoid);
  if (vocabularyAvoid.length > 0) merged.vocabulary_avoid = vocabularyAvoid;

  // FormatConfig: field-by-field merge (account wins per field; company fills gaps).
  const baseF = base.format ?? {};
  const overF = over.format ?? {};
  const format: FormatConfig = {};
  if (overF.word_count_min != null) format.word_count_min = overF.word_count_min;
  else if (baseF.word_count_min != null) format.word_count_min = baseF.word_count_min;
  if (overF.word_count_max != null) format.word_count_max = overF.word_count_max;
  else if (baseF.word_count_max != null) format.word_count_max = baseF.word_count_max;
  if (overF.register != null) format.register = overF.register;
  else if (baseF.register != null) format.register = baseF.register;
  if (overF.paragraphing != null) format.paragraphing = overF.paragraphing;
  else if (baseF.paragraphing != null) format.paragraphing = baseF.paragraphing;
  if (overF.hashtag_use != null) format.hashtag_use = overF.hashtag_use;
  else if (baseF.hashtag_use != null) format.hashtag_use = baseF.hashtag_use;
  if (Object.keys(format).length > 0) merged.format = format;

  return merged;
}
