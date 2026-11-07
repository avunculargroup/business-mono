import { z } from 'zod';
import type { Motif } from './imagePrompt.js';
import type { StoryCandidate } from './select.js';

// The image brief: the only part of an image an LLM decides. It picks one motif
// from the canon's closed vocabulary and describes the subject concretely — it
// never writes the prompt the image model receives (buildImagePrompt does). A
// pure linter then checks the brief before a render is paid for: one re-brief on
// a hit, then skip, never a loop — the same shape as the AI-tell gate.

export const imageBriefSchema = z.object({
  skip: z.boolean(),
  skip_reason: z.string().max(200).nullable(),
  motif_key: z.string().nullable(), // validated against active motifs by the linter
  subject: z.string().max(200).nullable(), // what is depicted, concretely
  metaphor: z.string().max(200).nullable(), // how the motif carries the idea
  composition: z.string().max(200).nullable(),
  alt_text: z.string().max(300).nullable(), // describes the image, not the post
});
export type ImageBrief = z.infer<typeof imageBriefSchema>;

export const FALLBACK_IMAGE_BRIEF: ImageBrief = {
  skip: true,
  skip_reason: 'Brief generation failed.',
  motif_key: null,
  subject: null,
  metaphor: null,
  composition: null,
  alt_text: null,
};

/** How many recent motifs the brief is told to avoid. */
export const RECENT_MOTIF_AVOID = 3;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * The motifs used by recent renders, most recent first. Each render writes one
 * row per platform crop with the same group id, so rows are deduped by group
 * before counting. Tolerates a null/non-array read (degrades to no history).
 */
export function recentMotifs(rows: unknown, max = RECENT_MOTIF_AVOID): string[] {
  if (!Array.isArray(rows)) return [];
  const seenGroups = new Set<string>();
  const out: string[] = [];
  for (const r of rows as Row[]) {
    const group = typeof r?.generation_group_id === 'string' ? r.generation_group_id : null;
    if (group) {
      if (seenGroups.has(group)) continue;
      seenGroups.add(group);
    }
    const key = r?.image_brief?.motif_key;
    if (typeof key === 'string' && key.length > 0) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

export interface ImageBriefPromptParams {
  story: Pick<StoryCandidate, 'title' | 'summary' | 'key_points'>;
  form: string;
  /** The persisted post copy the image sits beside (LinkedIn, else X). */
  postCopy: string;
  motifs: Motif[];
  recentMotifKeys: string[];
  /** Linter flags from a first attempt, for the single re-brief. */
  rewriteInstruction?: string | null;
}

export function buildImageBriefPrompt(p: ImageBriefPromptParams): string {
  const motifList = p.motifs
    .map((m) => `- ${m.key} (${m.label}): ${m.description}. Use when: ${m.use_when}`)
    .join('\n');
  const keyPoints = p.story.key_points.length > 0 ? p.story.key_points.map((k) => `- ${k}`).join('\n') : '(none)';
  const recent =
    p.recentMotifKeys.length > 0
      ? `\n\n## Recently used motifs\n${p.recentMotifKeys.join(', ')}. Avoid these unless no other motif fits the post.`
      : '';
  const rewrite = p.rewriteInstruction
    ? `\n\n## Re-brief — your last brief was rejected for these reasons\n${p.rewriteInstruction}`
    : '';

  return `Write a brief for one illustration to sit beside a founder's social post. You are not writing an image prompt: the house style, palette and prohibitions are fixed elsewhere. Your job is to choose a visual metaphor and describe the subject.

## The story
${p.story.title}
${p.story.summary}
Key points:
${keyPoints}

## The post (form: ${p.form.replace(/_/g, ' ')})
${p.postCopy}

## Motifs — choose exactly one motif_key from this list
${motifList}${recent}

## Rules
- subject: what is drawn, concretely, in one sentence. Objects and places, not abstractions.
- metaphor: how the chosen motif carries the post's idea, in one sentence.
- composition: optional, one short note on arrangement. Keep the bottom-right corner empty.
- No text, letters, numbers or figures anywhere in subject or metaphor — images cannot carry them.
- No coins, currency symbols, rockets, moons, bulls, bears, charts, candlesticks or arrows. Nothing that implies a price going up or down.
- No people's faces.
- alt_text: describe what the image shows for a screen reader, plainly, in under 300 characters. Describe the picture, not the post's argument.
- If the story has no honest visual — the image would only be filler — set skip = true with a short skip_reason and leave the other fields null. Skipping is a good outcome, not a failure.${rewrite}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive whole-word match; terms with no word character (₿, $) match as substrings. */
function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (!/\w/.test(t)) return text.includes(t);
  return new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(text);
}

/**
 * Lint a brief. Returns the specific flags, empty when clean. A skip brief is
 * always clean — the quiet path needs no fields.
 */
export function lintImageBrief(brief: ImageBrief, opts: { motifs: Motif[]; prohibitedTerms: string[] }): string[] {
  if (brief.skip) return [];
  const flags: string[] = [];

  const active = new Set(opts.motifs.filter((m) => m.is_active).map((m) => m.key));
  if (!brief.motif_key || !active.has(brief.motif_key)) {
    flags.push(`motif_key "${brief.motif_key ?? ''}" is not one of the listed motifs.`);
  }
  if (!brief.subject?.trim()) flags.push('subject is missing.');
  if (!brief.alt_text?.trim()) flags.push('alt_text is missing.');

  const fields: Array<[string, string | null]> = [
    ['subject', brief.subject],
    ['metaphor', brief.metaphor],
    ['composition', brief.composition],
  ];
  for (const [name, value] of fields) {
    if (!value) continue;
    const hits = opts.prohibitedTerms.filter((t) => containsTerm(value, t));
    if (hits.length > 0) flags.push(`${name} names prohibited imagery: ${hits.join(', ')}.`);
  }
  for (const [name, value] of fields.slice(0, 2)) {
    if (value && /\d/.test(value)) flags.push(`${name} contains digits; numbers invite rendered text.`);
  }
  return flags;
}

/** The re-brief instruction naming each flag, or null when the brief is clean. */
export function imageBriefRewriteInstruction(flags: string[]): string | null {
  if (flags.length === 0) return null;
  return flags.map((f) => `- ${f}`).join('\n');
}

/**
 * Lex prompt for the alt text alone. Alt text never carries a disclaimer, so no
 * keys are offered: the only question is whether it editorialises.
 */
export function buildAltTextLexPrompt(altText: string): string {
  return `Classify this image alt text for financial-advice risk. You are advisory — you never block; your verdict is data the founder reviews.

Alt text should only describe what an image shows. It must not editorialise, imply returns, or recommend anything.

## The alt text
${altText}

## Classify (exactly one)
- educational — plainly describes the picture; no claim, no recommendation.
- general_advice — implies an outcome, a direction for a price, or an action a reader could take.
- personal_opinion — reads as a personal recommendation or a founder's individual take.

Alt text never carries a disclaimer: set needs_disclaimer = false and disclaimer_key = null.

## Rationale
Give a one-breath rationale naming the specific phrase that moved your verdict. Do not rewrite the alt text.`;
}
