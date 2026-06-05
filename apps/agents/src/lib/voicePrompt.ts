import { resolveVoiceContext, type ResolvedVoiceContext } from '@platform/voice';

// Renders a ResolvedVoiceContext (from packages/voice) into the <brand-voice>
// prompt block content that content agents internalise. This is the bridge
// between the table-backed voice and an agent's system prompt, so voice edits in
// Brand Hub take effect without a redeploy.

function list(label: string, items: string[] | undefined): string | null {
  if (!items || items.length === 0) return null;
  return `**${label}:** ${items.join(', ')}`;
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

  if (p.format_notes) parts.push(`**Format notes:** ${p.format_notes}`);

  if (ctx.bitcoinCapitalisationRule) {
    parts.push(`**Bitcoin capitalisation rule (always enforced):** ${ctx.bitcoinCapitalisationRule}`);
  }

  if (ctx.snippets.length > 0) {
    const examples = ctx.snippets
      .map((s) => {
        const tags = [s.snippet_type, s.platform ?? 'any', ...s.topic_tags].join(' · ');
        const note = s.curator_note ? `\n  why it works: ${s.curator_note}` : '';
        return `- (${tags})\n  "${s.body}"${note}`;
      })
      .join('\n');
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
