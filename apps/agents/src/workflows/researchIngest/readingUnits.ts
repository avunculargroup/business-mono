/**
 * What the extractor reads: whole documents, or the items of a filing.
 *
 * The source-class gate refuses a ledger row whose source the ledger does not
 * accept, and it refuses it by raising inside the one transaction a run
 * commits in — so a single event drawn from a news article or a 10-K's MD&A
 * would take every other row in the run down with it. Deciding here what the
 * extractor may read at all, from the same accepted-class set the gate uses,
 * means such a claim is never extracted rather than extracted and refused.
 *
 * Spec: docs/features/corporate-holdings/schema-ingest-spec.md#ingest-workflow
 */

import { splitEdgarFiling, type FilingSection } from './edgarSections.js';

export interface ReadableDocument {
  id: string;
  title: string;
  text: string;
  sourceClass: string;
  venue: string | null;
}

export interface ReadingUnit {
  documentId: string;
  /** Null where the document is read whole and the gate judges its own class. */
  sectionId: string | null;
  filingItem: string | null;
  title: string;
  text: string;
  sourceClass: string;
}

/** A stored section, as `research_document_sections` returns it. */
export interface StoredSection {
  id: string;
  filing_item: string;
  source_class: string;
}

/**
 * Sections for an EDGAR filing, and nothing for anything else.
 *
 * Venue first, never the text: a news article that mentions a Form 10-K near
 * its top would otherwise be split into sections classed as filed, and a
 * secondary source would arrive at the gate wearing a class it never had.
 */
export function sectionsFor(document: ReadableDocument): FilingSection[] {
  if (document.venue !== 'sec') return [];
  return splitEdgarFiling(document.text, document.title);
}

/**
 * The units one document yields, given the sections now stored for it.
 *
 * The stored class wins over the splitter's. A section a researcher has
 * already classified by hand is a judgement the splitter does not get to
 * overwrite; the upsert that stores sections leaves existing rows alone, and
 * this reads back whatever is there.
 */
export function unitsFor(
  document: ReadableDocument,
  sections: readonly FilingSection[],
  stored: readonly StoredSection[],
): ReadingUnit[] {
  if (sections.length === 0) {
    return [
      {
        documentId: document.id,
        sectionId: null,
        filingItem: null,
        title: document.title,
        text: document.text,
        sourceClass: document.sourceClass,
      },
    ];
  }

  const byItem = new Map(stored.map((row) => [row.filing_item, row]));
  return sections.flatMap((section) => {
    const row = byItem.get(section.filingItem);
    // A section that did not store cannot be cited, and a claim that cannot
    // be cited is not read.
    if (!row) return [];
    return [
      {
        documentId: document.id,
        sectionId: row.id,
        filingItem: section.filingItem,
        title: document.title,
        text: section.text,
        sourceClass: row.source_class,
      },
    ];
  });
}

/** Units the ledger accepts, and the ones set aside with the class that kept them out. */
export function admitUnits(
  units: readonly ReadingUnit[],
  acceptedClasses: ReadonlySet<string>,
): { admitted: ReadingUnit[]; skipped: ReadingUnit[] } {
  const admitted: ReadingUnit[] = [];
  const skipped: ReadingUnit[] = [];
  for (const unit of units) {
    (acceptedClasses.has(unit.sourceClass) ? admitted : skipped).push(unit);
  }
  return { admitted, skipped };
}
