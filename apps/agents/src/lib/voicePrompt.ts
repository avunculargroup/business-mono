import { resolveVoiceContext, type ResolvedVoiceContext, type FormatConfig, type VoiceSnippet } from '@platform/voice';

// Renders a ResolvedVoiceContext (from packages/voice) into the <brand-voice>
// prompt block content that content agents internalise. This is the bridge
// between the table-backed voice and an agent's system prompt, so voice edits in
// Brand Hub take effect without a redeploy.

function list(label: string, items: string[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  return `**${label}:** ${items.join(', ')}`;
}

/** The label the format-notes line renders under — single source of truth so the
 *  prompt builders can detect its presence and let it override default lengths. */
export const FORMAT_NOTES_LABEL = 'Format notes';

/** True when a rendered voice block carries account/canon format notes — the
 *  signal that platform length defaults should defer to them. */
export function voiceBlockHasFormatNotes(voiceBlock: string): boolean {
  return voiceBlock.includes(`**${FORMAT_NOTES_LABEL}:**`);
}

/**
 * Extract the structured FormatConfig from a merged VoiceProfile, or null when
 * neither structured format nor legacy format_notes are set. The returned object
 * also carries `legacy_notes` (the old free-text field) so callers can choose
 * which rendering path to use.
 */
export function extractFormatConfig(
  profile: { format?: FormatConfig; format_notes?: string },
): (FormatConfig & { legacy_notes?: string }) | null {
  if (profile.format && Object.keys(profile.format).length > 0) {
    return { ...profile.format };
  }
  if (profile.format_notes && profile.format_notes.trim().length > 0) {
    return { legacy_notes: profile.format_notes.trim() };
  }
  return null;
}

/**
 * Render a FormatConfig as a human-readable summary for the voice block's
 * `**Format notes:**` line. Used when structured format fields replace the old
 * free-text `format_notes` string.
 */
export function renderFormatConfig(fmt: FormatConfig): string {
  const parts: string[] = [];
  if (fmt.word_count_min != null && fmt.word_count_max != null) {
    parts.push(`${fmt.word_count_min}–${fmt.word_count_max} words`);
  } else if (fmt.word_count_max != null) {
    parts.push(`up to ${fmt.word_count_max} words`);
  } else if (fmt.word_count_min != null) {
    parts.push(`at least ${fmt.word_count_min} words`);
  }
  if (fmt.char_count_min != null && fmt.char_count_max != null) {
    parts.push(`${fmt.char_count_min}–${fmt.char_count_max} characters`);
  } else if (fmt.char_count_max != null) {
    parts.push(`up to ${fmt.char_count_max} characters`);
  } else if (fmt.char_count_min != null) {
    parts.push(`at least ${fmt.char_count_min} characters`);
  }
  if (fmt.register) parts.push(`${fmt.register} register`);
  if (fmt.paragraphing && fmt.paragraphing !== 'platform-default') {
    parts.push(fmt.paragraphing === 'single-block' ? 'single block' : 'short paragraphs');
  }
  if (fmt.hashtag_use && fmt.hashtag_use !== 'platform-default') {
    parts.push(fmt.hashtag_use === 'none' ? 'no hashtags' : 'hashtags sparingly (1–2)');
  }
  if (fmt.emoji_use && fmt.emoji_use !== 'platform-default') {
    parts.push(fmt.emoji_use === 'none' ? 'no emojis' : 'emojis sparingly');
  }
  if (fmt.thread_style === 'single-only') {
    parts.push('single posts only (no threads)');
  }
  return parts.join(', ');
}

/** One retrieved exemplar rendered as a prompt line: its meta tags, the body, and
 *  (when present) the curator's note. Shared by the exemplars and cadence blocks. */
function renderSnippetLine(s: VoiceSnippet): string {
  const tags = [s.snippet_type, s.platform ?? 'any', ...s.topic_tags].join(' · ');
  const note = s.curator_note ? `\n  why it works: ${s.curator_note}` : '';
  return `- (${tags})\n  "${s.body}"${note}`;
}

/**
 * Render opener/closer exemplars as a compact "cadence" block — how this founder
 * tends to open and close, so Charlie borrows the rhythm, not the words. Empty
 * string when there are no cadence snippets (so the caller can omit the section).
 */
export function formatCadenceExemplars(snippets: VoiceSnippet[]): string {
  if (snippets.length === 0) return '';
  const lines = snippets.map(renderSnippetLine).join('\n');
  return `**How you tend to open and close — borrow the cadence, not the words:**\n${lines}`;
}

/** Format the merged profile (+ rule, mission, any retrieved snippets) as markdown. */
export function formatResolvedVoice(ctx: ResolvedVoiceContext): string {
  const p = ctx.profile;
  const parts: string[] = [];

  if (ctx.missionSummary) parts.push(`**Company mission:** ${ctx.missionSummary}`);
  if (p.persona) parts.push(`**Persona:** ${p.persona}`);

  const tone = list('Tone attributes', p.tone_attributes);
  if (tone) parts.push(tone);

  const doList = list('Vocabulary — use', p.vocabulary_do);
  if (doList) parts.push(doList);

  const avoidList = list('Vocabulary — avoid (never use)', p.vocabulary_avoid);
  if (avoidList) parts.push(avoidList);

  const devices = list('Signature devices', p.signature_devices);
  if (devices) parts.push(devices);

  if (p.format && Object.keys(p.format).length > 0) {
    const rendered = renderFormatConfig(p.format);
    if (rendered) parts.push(`**${FORMAT_NOTES_LABEL}:** ${rendered}`);
  } else if (p.format_notes) {
    parts.push(`**${FORMAT_NOTES_LABEL}:** ${p.format_notes}`);
  }

  const policy = ctx.contentPolicy ?? {};
  const endorsed = list('Topics to comment on', policy.topics_endorsed);
  if (endorsed) parts.push(endorsed);
  const avoided = list('Topics to avoid (never post about these)', policy.topics_avoided);
  if (avoided) parts.push(avoided);
  const aligned = list('Voices we align with', policy.aligned_voices);
  if (aligned) parts.push(aligned);
  const contrarian = list('Voices we respectfully disagree with', policy.contrarian_views);
  if (contrarian) parts.push(contrarian);

  if (ctx.bitcoinCapitalisationRule) {
    parts.push(`**Bitcoin capitalisation rule (always enforced):** ${ctx.bitcoinCapitalisationRule}`);
  }

  if (ctx.snippets.length > 0) {
    const examples = ctx.snippets.map(renderSnippetLine).join('\n');
    parts.push(`**Exemplars — write in this register (do not copy):**\n${examples}`);
  }

  return parts.join('\n\n');
}

/**
 * Resolve the company-canon voice from the DB and format it as a prompt block.
 * Returns null when the canon isn't available yet (empty table pre-seed, or a
 * transient error) so callers can fall back to the legacy doc until the parity
 * gate retires it. Optionally retrieves exemplars when a `query` is supplied.
 */
export async function resolveCompanyVoiceBlock(
  opts: { query?: string | null } = {},
): Promise<string | null> {
  try {
    const ctx = await resolveVoiceContext({ accountId: null, query: opts.query ?? null });
    // A canon with no persona means the table isn't seeded — defer to the doc.
    if (!ctx.profile.persona) return null;
    return formatResolvedVoice(ctx);
  } catch {
    return null;
  }
}
