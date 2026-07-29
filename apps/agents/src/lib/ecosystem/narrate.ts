// Narration — the one LLM call in the ecosystem path, and the most tightly
// fenced one on the platform.
//
// The narrator receives the change's payload and nothing else. It cannot cite a
// version, a date or a count it was not handed, because it was handed nothing
// else. That is the same construction as the findings narrator, for the same
// reason: the model writes the sentence, it never decides the facts.
//
// The compliance seam matters more here than anywhere. "Coldcard released
// firmware 6.3.4 on 12 July" is a fact. "Coldcard released an important
// security fix — update immediately" is product advice from an authorised
// representative. One careless sentence is the whole difference, so the
// mechanical lint below runs before any summary is persisted, and a summary
// that fails it is dropped rather than published.

import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { dynamicModelFor, stepRequestContext } from '../../config/model.js';
import { createLogger } from '../logger.js';

const log = createLogger('ecosystem-narrate');

export const NARRATE_SCOPE_KEY = 'ecosystemScan.narrate';

const narrationSchema = z.object({
  summary: z.string().describe('One neutral sentence stating what changed.'),
});

const SYSTEM_PROMPT = `You write a single neutral sentence describing an ecosystem change for an internal feed read by two directors of a Bitcoin treasury consultancy.

You are given a JSON payload of verified facts. That payload is the ONLY thing you may draw on.

HARD RULES
- One sentence. No preamble, no second sentence, no markdown.
- Use ONLY values present in the payload. Never introduce a number, version, date, product name or count that is not in it.
- State what changed. Do not say whether it is good, bad, urgent, important, concerning, or reassuring.
- Never recommend an action. No "should", "must", "update", "review", "consider", "act", "upgrade", "migrate", "avoid".
- Never characterise the entity: not its safety, solvency, legality, quality or reliability.
- No exclamation marks. Australian English. Capital B for the Bitcoin network, lowercase b for the currency.
- A release is an event, not news of an improvement. A de-listing is an observation, not a verdict.

GOOD
- "Coldcard released firmware 6.3.4 on 12 July."
- "Proof-of-reserves last attested 401 days ago, against an expected 90-day cadence."
- "GHSA-xxxx-xxxx-xxxx affects versions below 2.1.0, rated high by the publisher."
- "Entity X no longer appears on the AUSTRAC digital currency exchange register as of 14 July."

BAD
- "Coldcard released an important security fix — update immediately." (advice, and "important" is a judgment)
- "This custodian may be insolvent." (a verdict the facts do not support)
- "You are at risk until you patch." (advice)
- "Good news for holders." (valence)

Return ONLY a JSON object matching the requested schema.`;

let narratorAgent: Agent | null = null;
function getNarrator(): Agent {
  if (!narratorAgent) {
    narratorAgent = new Agent({
      id: 'ecosystemNarrator',
      name: 'ecosystemNarrator',
      instructions: SYSTEM_PROMPT,
      model: dynamicModelFor(NARRATE_SCOPE_KEY),
      // Low temperature: the same payload should produce the same sentence.
      defaultOptions: { modelSettings: { temperature: 0.2, maxOutputTokens: 512 } },
    });
  }
  return narratorAgent;
}

// ── The narration contract, checked mechanically ────────────────────────────

// Words that turn an observation into advice or a judgment.
//
// Matched as whole words with an optional adverbial "-ly", so "released" does
// not trip "release" but "operating illegally" does trip "illegal". The suffix
// is not cosmetic: the spec's canonical prohibited sentence is "This exchange
// is operating illegally and is unsafe to use", and a bare \billegal\b misses
// it entirely.
const FORBIDDEN_WORDS = [
  'should', 'must', 'need to', 'recommend', 'recommended', 'advise', 'advised',
  'urgent', 'immediate', 'critical', 'important', 'significant',
  'concerning', 'worrying', 'alarming', 'reassuring', 'safe', 'unsafe', 'risky',
  'insolvent', 'illegal', 'unlawful', 'fraudulent', 'scam',
  'upgrade now', 'act now', 'avoid', 'good news', 'bad news', 'worth noting',
];

export interface LintViolation {
  rule: 'forbidden_word' | 'unsupported_number' | 'exclamation' | 'too_long' | 'empty';
  detail: string;
}

/** Every number appearing anywhere in the payload, as strings, for provenance. */
function payloadNumbers(payload: unknown, into: Set<string> = new Set()): Set<string> {
  if (payload === null || payload === undefined) return into;

  if (typeof payload === 'number') {
    into.add(String(payload));
    return into;
  }
  if (typeof payload === 'string') {
    // Digit runs inside strings count as supported: a version "6.3.4" or a date
    // "2026-07-12" in the payload licenses those digits in the sentence.
    for (const run of payload.match(/\d+/g) ?? []) into.add(run);
    return into;
  }
  if (Array.isArray(payload)) {
    for (const entry of payload) payloadNumbers(entry, into);
    return into;
  }
  if (typeof payload === 'object') {
    for (const value of Object.values(payload)) payloadNumbers(value, into);
  }
  return into;
}

/**
 * The payload-only narration contract, as a pure function.
 *
 * Two hard checks: no advice/valence vocabulary, and no digits the payload does
 * not contain. The second is the provenance check — it is what stops a model
 * helpfully rounding "401 days" to "over a year" or inventing a version number.
 *
 * Month names are allowed through: "12 July" is a rendering of a payload date,
 * not a new fact. The digits still have to check out.
 */
export function lintNarration(summary: string, payload: Record<string, unknown>): LintViolation[] {
  const violations: LintViolation[] = [];
  const trimmed = summary.trim();

  if (!trimmed) {
    return [{ rule: 'empty', detail: 'Narration is empty.' }];
  }

  if (trimmed.includes('!')) {
    violations.push({ rule: 'exclamation', detail: 'Exclamation mark present.' });
  }

  // A runaway paragraph is a sign the model started explaining rather than
  // stating, which is where advice creeps in.
  if (trimmed.length > 320) {
    violations.push({ rule: 'too_long', detail: `${trimmed.length} characters; one sentence expected.` });
  }

  const lower = trimmed.toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}(ly)?\\b`, 'i');
    if (pattern.test(lower)) {
      violations.push({ rule: 'forbidden_word', detail: `"${word}" is advice or a judgment.` });
    }
  }

  const supported = payloadNumbers(payload);
  for (const run of trimmed.match(/\d+/g) ?? []) {
    // Leading zeros in the sentence ("06") against "6" in the payload are the
    // same fact rendered differently.
    if (supported.has(run) || supported.has(String(Number(run)))) continue;
    violations.push({
      rule: 'unsupported_number',
      detail: `"${run}" does not appear in the payload.`,
    });
  }

  return violations;
}

/**
 * Narrate one change. Returns null when the model failed or its output could
 * not be made to pass the lint — the caller leaves `summary` NULL, and the feed
 * shows the deterministic title and payload instead. An un-narrated change is a
 * perfectly good change; a non-compliant sentence is not.
 */
export async function narrateChange(input: {
  changeType: string;
  title: string;
  payload: Record<string, unknown>;
}): Promise<string | null> {
  const basePrompt = [
    `change_type: ${input.changeType}`,
    `title: ${input.title}`,
    '',
    `payload:\n${JSON.stringify(input.payload, null, 2)}`,
    '',
    'Write the sentence now.',
  ].join('\n');

  const generate = async (prompt: string): Promise<string | null> => {
    const response = await getNarrator().generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext(NARRATE_SCOPE_KEY),
      structuredOutput: {
        schema: narrationSchema,
        errorStrategy: 'fallback',
        fallbackValue: { summary: '' },
      },
    });
    const summary = (response.object as { summary?: string } | undefined)?.summary?.trim();
    return summary || null;
  };

  try {
    let summary = await generate(basePrompt);
    if (!summary) return null;

    let violations = lintNarration(summary, input.payload);
    if (violations.length === 0) return summary;

    // One corrective pass, then stop. Looping a model against a linter
    // unsupervised is how you get a sentence that satisfies the checker and
    // says nothing — better to withhold and show the facts.
    const retryPrompt = [
      basePrompt,
      '',
      'Your previous sentence broke the rules:',
      `"${summary}"`,
      ...violations.map((v) => `- ${v.detail}`),
      '',
      'Rewrite it using only the payload, stating what changed and nothing about what it means.',
    ].join('\n');

    summary = await generate(retryPrompt);
    if (!summary) return null;

    violations = lintNarration(summary, input.payload);
    if (violations.length === 0) return summary;

    log.warn(
      { title: input.title, violations: violations.map((v) => v.detail) },
      'narration withheld after corrective pass',
    );
    return null;
  } catch (err) {
    log.error({ err, title: input.title }, 'narration failed');
    return null;
  }
}
