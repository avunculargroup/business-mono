/**
 * Drafting the subscriber summary.
 *
 * The one place on the platform where a model writes prose meant for
 * subscribers, and BTS holds no AFS authorisation. So the draft is composed
 * only from implementation facts (never `curator_notes`, which are internal
 * and often outcome-shaped), it is filtered here for words and metrics that
 * read as advice or performance, and it does nothing until a person edits and
 * clears it. The database refuses clearance on an unedited draft.
 *
 * Pure: prompt, filter and staleness rule, so all three are testable without
 * a model or a database. The step that calls them is in `index.ts`.
 *
 * Spec: docs/features/corporate-holdings/schema-ingest-spec.md
 *       → "The ingest drafts the client_summary"
 */

/** One implementation fact, as `research_company_facts` holds it. */
export interface SummaryFact {
  field_key: string;
  label: string;
  value: string;
  as_of: string | null;
  updated_at: string;
}

/**
 * Words a subscriber summary may not contain, from the "Words to avoid"
 * section of `.claude/skills/bts-design/references/naming.md`. Matched as
 * whole words, so "Coinbase" is not "coin" and "knowledge" is not "edge".
 */
export const SUMMARY_PROHIBITED_WORDS: readonly string[] = Object.freeze([
  'advice',
  'advise',
  'adviser',
  'advisor',
  'recommend',
  'recommends',
  'recommended',
  'recommendation',
  'should',
  'best',
  'top',
  'leading',
  'optimal',
  'guarantee',
  'guaranteed',
  'proven',
  'edge',
  'alpha',
  'outperform',
  'outperformed',
  'outperforms',
  'financial planner',
  'crypto',
  'coin',
  'coins',
  'hodl',
  'moon',
  'degen',
  'ape',
]);

/**
 * Outcome language the classify step already treats as restricted, kept out
 * of the summary in the same terms. The restricted metrics themselves (mNAV,
 * BTC Yield and the rest) come from the `restricted_metrics` table at run
 * time, so a metric added there is filtered here without a deploy.
 */
export const SUMMARY_OUTCOME_PHRASES: readonly string[] = Object.freeze([
  'unrealised gain',
  'unrealised loss',
  'unrealized gain',
  'unrealized loss',
  'premium to',
  'discount to',
  'share price',
  'dilution',
  'accretive',
  'accretion',
  'return on',
]);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsTerm(text: string, term: string): boolean {
  // \b does not sit next to "¥" or other non-word characters, so the boundary
  // is spelled out: not preceded or followed by a letter or digit.
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, 'iu');
  return pattern.test(text);
}

/**
 * Every prohibited word, outcome phrase or restricted metric the draft uses.
 * Empty means it may be stored as a draft — not that it may be published.
 */
export function summaryViolations(text: string, restrictedTerms: readonly string[]): string[] {
  const found: string[] = [];
  for (const term of [...SUMMARY_PROHIBITED_WORDS, ...SUMMARY_OUTCOME_PHRASES, ...restrictedTerms]) {
    if (term.trim() && containsTerm(text, term) && !found.includes(term)) found.push(term);
  }
  if (text.includes('!')) found.push('!');
  return found;
}

/** The newest edit among the facts, which is what a draft is current as of. */
export function factsAsOf(facts: readonly SummaryFact[]): string | null {
  let latest: string | null = null;
  for (const fact of facts) {
    if (latest === null || fact.updated_at > latest) latest = fact.updated_at;
  }
  return latest;
}

/**
 * Whether this run should draft.
 *
 * Only for a record with no summary yet: once a person has written one, a
 * fresh draft each week is noise beside it. And only when there is no draft,
 * or a fact has changed since the draft was composed.
 */
export function needsDraft(input: {
  clientSummary: string | null;
  facts: readonly SummaryFact[];
  existing: { facts_as_of: string | null } | null;
}): boolean {
  if (input.clientSummary?.trim()) return false;
  if (input.facts.length === 0) return false;
  if (!input.existing) return true;
  const asOf = factsAsOf(input.facts);
  if (!asOf || !input.existing.facts_as_of) return true;
  return new Date(asOf).getTime() > new Date(input.existing.facts_as_of).getTime();
}

/** The prompt. `rejected` carries the terms a previous attempt used. */
export function summaryPrompt(input: {
  legalName: string;
  facts: readonly SummaryFact[];
  rejected?: readonly string[];
}): string {
  const facts = input.facts
    .map(
      (fact) =>
        `- ${fact.label} (${fact.field_key}${fact.as_of ? `, as of ${fact.as_of}` : ''}): ${fact.value}`,
    )
    .join('\n');

  const retry =
    input.rejected && input.rejected.length > 0
      ? `\n\nA previous draft was refused because it used: ${input.rejected
          .map((term) => `"${term}"`)
          .join(', ')}. Do not use any of these.`
      : '';

  return `Draft the summary a subscriber reads at the top of this company's entry in a register of how listed entities hold bitcoin.

Company: ${input.legalName}

Stated facts, each from a cited filing:
${facts}

Rules:
- Use only the facts above. Add nothing from general knowledge about the company.
- Say how the entity holds bitcoin and how it discloses it: the mandate it relies on, who holds the keys, how it accounts for the holding. Never how the holding has performed, what it is worth, or what it means for the company's securities.
- No figures about value, gains, losses, share price, premium, discount or yield.
- Never advise, recommend or judge. No "should", "best", "leading" or similar.
- Australian English. "Bitcoin" capitalised for the network, "bitcoin" lowercase for the unit. No exclamation marks.
- Two to four sentences, at most 100 words. Plain prose, no headings or lists.

A person edits this draft before anyone outside the team reads it.${retry}`;
}
