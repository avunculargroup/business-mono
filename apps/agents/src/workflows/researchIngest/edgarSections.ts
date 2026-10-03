/**
 * Splitting an EDGAR filing on its item headings.
 *
 * A filing is not uniform inside itself. A 10-K's Item 8 is audited financial
 * statements and its Item 7 is management's narrative; an 8-K's Item 8.01 is
 * filed and its Item 7.01 is furnished. The source-class gate ranks by filing
 * item for exactly that reason (Decision 1), and it is worthless to the ingest
 * unless the extractor knows which item a claim came from.
 *
 * Deterministic string work, not a model judgement. An agent asked which item
 * a sentence sits under will answer with great confidence, which is the
 * problem. A heading either is at the start of a line or it is not.
 *
 * Spec: docs/features/corporate-holdings/schema-ingest-spec.md#ingest-workflow
 */

export type EdgarForm = '8-K' | '10-K' | '10-Q';

export interface FilingSection {
  /** As `research_document_sections.filing_item` stores it: '8-K Item 8.01', '10-Q Part I Item 1'. */
  filingItem: string;
  sourceClass: string;
  /** False for furnished content. */
  isFiled: boolean;
  text: string;
}

/**
 * The form a filing is, from its cover page, then its registered title.
 *
 * Only the three forms this splits. A 6-K is one furnished report with no
 * items, and an exhibit filed as its own document is already classed whole.
 */
export function detectEdgarForm(text: string, title: string): EdgarForm | null {
  const cover = text.slice(0, 4000);
  const fromCover = /\bFORM\s+(8-K|10-K|10-Q)\b/i.exec(cover)?.[1];
  const fromTitle = /^Form\s+(8-K|10-K|10-Q)\b/i.exec(title.trim())?.[1];
  const form = (fromCover ?? fromTitle)?.toUpperCase();
  return form === '8-K' || form === '10-K' || form === '10-Q' ? form : null;
}

/**
 * 8-K items whose content is furnished rather than filed: results of
 * operations, and Regulation FD disclosure. General Instruction B.2 keeps
 * both outside section 18 liability, which is the distinction the gate draws.
 */
const FURNISHED_8K_ITEMS = new Set(['2.02', '7.01']);

/**
 * A heading at the start of a line, after any markdown emphasis or heading
 * marks. A cross-reference ("as described in Item 7") is mid-sentence and
 * never matches; a table-of-contents row starting with a pipe does not either.
 */
const ITEM_HEADING = /^[ \t]*(?:#{1,6}[ \t]+)?[*_]{0,2}[ \t]*ITEM[ \t]+(\d{1,2}[A-C]?(?:\.\d{2})?)\b/gim;
const PART_HEADING = /^[ \t]*(?:#{1,6}[ \t]+)?[*_]{0,2}[ \t]*PART[ \t]+(IV|III|II|I)\b/gim;
const SIGNATURES = /^[ \t]*(?:#{1,6}[ \t]+)?[*_]{0,2}[ \t]*SIGNATURES?\b[*_]{0,2}[ \t]*$/im;

interface Heading {
  key: string;
  at: number;
}

function headings(pattern: RegExp, text: string): Heading[] {
  return [...text.matchAll(pattern)].map((match) => ({
    key: match[1].toUpperCase(),
    at: match.index ?? 0,
  }));
}

/**
 * Where the body begins. Periodic reports open with a table of contents that
 * repeats every heading; the body starts at the last "PART I" heading, which
 * is the one after the contents. An 8-K has no parts, and starts at zero.
 */
function bodyStart(text: string): number {
  const partOnes = headings(PART_HEADING, text).filter((part) => part.key === 'I');
  return partOnes.at(-1)?.at ?? 0;
}

/** Text from each heading to the next, the last running to the signatures or the end. */
function slice(text: string, starts: Heading[], end: number): Array<Heading & { text: string }> {
  return starts.map((heading, index) => ({
    ...heading,
    text: text.slice(heading.at, starts[index + 1]?.at ?? end).trim(),
  }));
}

/**
 * The first occurrence of each key inside the body, in document order.
 *
 * First, because the contents are already behind `bodyStart`, and a later
 * recurrence is a running page header inside the item itself. Starting there
 * would hand the item's opening pages to the item before it — the first pages
 * of the financial statements, classed as narrative.
 */
function firstOfEach(found: Heading[]): Heading[] {
  const byKey = new Map<string, Heading>();
  for (const heading of found) if (!byKey.has(heading.key)) byKey.set(heading.key, heading);
  return [...byKey.values()].sort((a, b) => a.at - b.at);
}

function classify8K(item: string): Pick<FilingSection, 'sourceClass' | 'isFiled'> {
  return FURNISHED_8K_ITEMS.has(item)
    ? { sourceClass: 'furnished_release', isFiled: false }
    : { sourceClass: 'exchange_announcement', isFiled: true };
}

/**
 * Splits a filing into its items, each with the class the gate should judge it
 * by. Empty where the form is not one this knows or no item heading is found:
 * the caller then treats the document whole, under its registered class, which
 * is what happened before this existed.
 */
export function splitEdgarFiling(text: string, title: string): FilingSection[] {
  const form = detectEdgarForm(text, title);
  if (!form) return [];

  const start = bodyStart(text);
  const signatures = SIGNATURES.exec(text.slice(start));
  const end = signatures ? start + (signatures.index ?? 0) : text.length;
  const body = headings(ITEM_HEADING, text).filter((h) => h.at >= start && h.at < end);

  if (form === '8-K') {
    // 8-K items carry a decimal; anything else is a stray match.
    const items = firstOfEach(body.filter((h) => /^\d\.\d{2}$/.test(h.key)));
    return slice(text, items, end).map((section) => ({
      filingItem: `8-K Item ${section.key}`,
      ...classify8K(section.key),
      text: section.text,
    }));
  }

  if (form === '10-K') {
    const items = firstOfEach(body.filter((h) => /^\d{1,2}[A-C]?$/.test(h.key)));
    return slice(text, items, end).map((section) => ({
      filingItem: `10-K Item ${section.key}`,
      // Item 8 is the audited statements and notes; everything else, the
      // business description and MD&A included, is narrative.
      ...(section.key === '8'
        ? { sourceClass: 'audited_accounts', isFiled: true }
        : { sourceClass: 'filed_narrative', isFiled: true }),
      text: section.text,
    }));
  }

  // 10-Q: Part I and Part II both have an Item 1, so the part is part of the key.
  const partTwo = headings(PART_HEADING, text)
    .filter((part) => part.key === 'II' && part.at >= start)
    .at(-1)?.at ?? end;
  const keyed = body
    .filter((h) => /^\d{1,2}[A-C]?$/.test(h.key))
    .map((h) => ({ key: `${h.at < partTwo ? 'I' : 'II'}:${h.key}`, at: h.at }));
  const items = firstOfEach(keyed);

  return slice(text, items, end).map((section) => {
    const [part, item] = section.key.split(':');
    return {
      filingItem: `10-Q Part ${part} Item ${item}`,
      // Part I Item 1 is the financial statements and notes: filed and
      // reviewed, not audited. MD&A and everything in Part II is narrative.
      ...(part === 'I' && item === '1'
        ? { sourceClass: 'filed_financials', isFiled: true }
        : { sourceClass: 'filed_narrative', isFiled: true }),
      text: section.text,
    };
  });
}
