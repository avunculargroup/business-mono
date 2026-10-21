/**
 * Reading what a company does, and its headcount, out of its filings.
 *
 * The subscriber summary opens with both, and it may only use facts a filing
 * states. So the ingest reads them here, as `research_company_facts` rows a
 * person reviews like any other draft. Size is headcount and nothing else:
 * market capitalisation, revenue and assets are outcome facts.
 *
 * Pure: the keyword gate, the prompt, the checks and the choice between
 * documents, so all of it is testable without a model or a database. The step
 * that calls them is in `index.ts`.
 *
 * Spec: supabase/migrations/20261021000000_business_description_and_headcount.sql
 */

import { z } from 'zod';
import { validateClaims } from './numerics.js';
import { summaryViolations } from './summaryDraft.js';

export const PROFILE_FIELDS = Object.freeze({
  business_description: 'Business',
  headcount: 'Employees',
} as const);

export type ProfileFieldKey = keyof typeof PROFILE_FIELDS;

/**
 * Text that might say what the company does or how many people it employs.
 * A cheap gate before a model call: the profile fields accept exchange
 * announcements, and most of those are a purchase notice with neither.
 */
const PROFILE_HINTS =
  /\b(employ(s|ed|ees?)|headcount|full[- ]time|staff|workforce|principal activit(y|ies)|nature of (the )?business|our business|business overview|we are an?|the company is an?)\b/i;

export function mayStateProfile(text: string): boolean {
  return PROFILE_HINTS.test(text);
}

/** What the model returns for one unit. Either half may be absent. */
export const profileExtractionSchema = z.object({
  business_description: z
    .object({
      value: z.string(),
      as_of: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  headcount: z
    .object({
      value: z.number(),
      as_of: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
});

/** One fact as the persist step writes it. */
export const profileFactSchema = z.object({
  field_key: z.enum(['business_description', 'headcount']),
  label: z.string(),
  value: z.string(),
  as_of: z.string().nullable(),
  source_document_id: z.string(),
  source_section_id: z.string().nullable(),
  natural_key: z.string(),
});
export type ProfileFact = z.infer<typeof profileFactSchema>;

export function profilePrompt(unit: {
  documentId: string;
  title: string;
  filingItem: string | null;
  sourceClass: string;
  text: string;
}): string {
  return `Read what this company does and how many people it employs from this filing.

Document id: ${unit.documentId}
Title: ${unit.title}${unit.filingItem ? `\nFiling item: ${unit.filingItem}` : ''}
Source class: ${unit.sourceClass}

business_description:
- One or two plain sentences on what the company does: its business lines, products or services, and the markets it serves, as this document states them.
- Describe, never praise. Leave out claims such as "leading", "best", "top" or "innovative", even when the document makes them.
- Nothing about bitcoin holdings, share price, value, revenue, profit or performance.
- Australian English. At most 50 words.

headcount:
- The number of employees the document states, EXACTLY as written. Do not round, add up or estimate. It is checked against this text afterwards and discarded if it does not appear.
- Only a stated total of employees. Not contractors alone, not one division.

as_of for either: the date the document states it as at, as YYYY-MM-DD, or null if it gives none.

Return null for anything this document does not state. Do not use general knowledge about the company. Saying nothing is a valid answer.

Document text:
${unit.text}`;
}

/** The figure, as the register shows it. */
export function formatHeadcount(value: number): string {
  return value.toLocaleString('en-AU');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The facts one unit yields, after the checks. A headcount the text does not
 * state is dropped; so is a description the summary filter would refuse,
 * because it is what the summary is drafted from.
 */
export function checkProfile(
  extraction: z.infer<typeof profileExtractionSchema>,
  unit: { documentId: string; sectionId: string | null; text: string },
  restrictedTerms: readonly string[],
): { facts: Array<Omit<ProfileFact, 'natural_key'>>; dropped: Array<{ field: ProfileFieldKey; reason: string }> } {
  const facts: Array<Omit<ProfileFact, 'natural_key'>> = [];
  const dropped: Array<{ field: ProfileFieldKey; reason: string }> = [];
  const source = { source_document_id: unit.documentId, source_section_id: unit.sectionId };
  const asOf = (value: string | null) => (value && ISO_DATE.test(value) ? value : null);

  const description = extraction.business_description?.value.trim();
  if (description) {
    const violations = summaryViolations(description, restrictedTerms);
    if (violations.length > 0) {
      dropped.push({ field: 'business_description', reason: `uses ${violations.join(', ')}` });
    } else {
      facts.push({
        field_key: 'business_description',
        label: PROFILE_FIELDS.business_description,
        value: description,
        as_of: asOf(extraction.business_description!.as_of),
        ...source,
      });
    }
  }

  const headcount = extraction.headcount;
  if (headcount) {
    const verdict = validateClaims([{ field: 'headcount', value: headcount.value }], unit.text);
    if (!Number.isInteger(headcount.value) || headcount.value <= 0) {
      dropped.push({ field: 'headcount', reason: 'not a whole number of people' });
    } else if (!verdict.ok) {
      dropped.push({ field: 'headcount', reason: 'figure not present in source' });
    } else {
      facts.push({
        field_key: 'headcount',
        label: PROFILE_FIELDS.headcount,
        value: formatHeadcount(headcount.value),
        as_of: asOf(headcount.as_of),
        ...source,
      });
    }
  }

  return { facts, dropped };
}

/**
 * One fact per field: the one stated as of the latest date, a dated one over
 * an undated one. Ties go to the lowest document and section id, so the same
 * corpus picks the same source every run — a source that flipped between runs
 * would send a reviewed fact back to draft each week.
 */
export function pickProfileFacts(
  slug: string,
  candidates: ReadonlyArray<Omit<ProfileFact, 'natural_key'>>,
): ProfileFact[] {
  const best = new Map<string, Omit<ProfileFact, 'natural_key'>>();
  const sourceKey = (fact: Omit<ProfileFact, 'natural_key'>) =>
    `${fact.source_document_id}:${fact.source_section_id ?? ''}`;

  for (const fact of candidates) {
    const current = best.get(fact.field_key);
    if (!current) {
      best.set(fact.field_key, fact);
      continue;
    }
    const a = fact.as_of ?? '';
    const b = current.as_of ?? '';
    if (a > b || (a === b && sourceKey(fact) < sourceKey(current))) best.set(fact.field_key, fact);
  }

  return [...best.values()]
    .sort((a, b) => a.field_key.localeCompare(b.field_key))
    .map((fact) => ({ ...fact, natural_key: `${slug}:fact:${fact.field_key}` }));
}
