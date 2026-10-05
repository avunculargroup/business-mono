/**
 * Registration — where a company-bound source's finds go instead of the feed.
 *
 * The spec's rule for discovery: `researchIngest` reads a corpus and nothing
 * builds one, so reportWatch builds it. A filing found for a research company
 * becomes a `research_documents` row, classified by what the venue states
 * about it (the form type), and the next ingest run fetches and reads it.
 * Nothing is downloaded here: fetching, sectioning and the source-class gate
 * are the ingest's job, and doing them twice would let the two disagree.
 *
 * Spec: docs/features/corporate-holdings/schema-ingest-spec.md
 *       → Discovery: how documents arrive
 */

import { reportDb } from './db.js';
import type { FilingMeta } from './types.js';

/** How a form type registers. Mirrors how the hand-entered SEC rows were classed. */
export interface FilingClass {
  documentType: 'announcement' | 'annual_report' | 'other';
  sourceClass: 'exchange_announcement' | 'audited_accounts' | 'filed_financials';
  isAudited: boolean;
}

const BY_FORM: Record<string, FilingClass> = {
  // Current reports. 8-K items are split into filed and furnished sections by
  // the ingest (edgarSections.ts), so the document-level class is the filed one.
  '8-K': { documentType: 'announcement', sourceClass: 'exchange_announcement', isAudited: false },
  '8-K/A': { documentType: 'announcement', sourceClass: 'exchange_announcement', isAudited: false },
  '6-K': { documentType: 'announcement', sourceClass: 'exchange_announcement', isAudited: false },
  // Quarterlies: statements and notes, unaudited.
  '10-Q': { documentType: 'other', sourceClass: 'filed_financials', isAudited: false },
  '10-Q/A': { documentType: 'other', sourceClass: 'filed_financials', isAudited: false },
  // Annual reports carry the audited statements.
  '10-K': { documentType: 'annual_report', sourceClass: 'audited_accounts', isAudited: true },
  '10-K/A': { documentType: 'annual_report', sourceClass: 'audited_accounts', isAudited: true },
  '20-F': { documentType: 'annual_report', sourceClass: 'audited_accounts', isAudited: true },
  '40-F': { documentType: 'annual_report', sourceClass: 'audited_accounts', isAudited: true },
};

/** Null for a form this register has no class for. It is not registered. */
export function classifyFiling(form: string): FilingClass | null {
  return BY_FORM[form.toUpperCase()] ?? null;
}

/** "Form 8-K — Items 7.01, 8.01", or "Form 10-Q, period ended 2026-09-30". */
export function filingTitle(filing: FilingMeta): string {
  if (filing.items.length > 0) return `Form ${filing.form} — Items ${filing.items.join(', ')}`;
  if (filing.reportDate) return `Form ${filing.form}, period ended ${filing.reportDate}`;
  return `Form ${filing.form}`;
}

export type RegisterOutcome =
  | { ok: true; documentId: string; created: boolean }
  | { ok: false; error: string };

async function existing(companyId: string, accession: string): Promise<string | null> {
  const { data } = await reportDb
    .from('research_documents')
    .select<{ id: string }>('id')
    .eq('company_id', companyId)
    .eq('venue', 'sec')
    .eq('announcement_id', accession)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Register one filing against a company, or recognise it as already there.
 *
 * Keyed on the accession number, which every hand-entered SEC row carries in
 * `announcement_id`: a filing someone registered by hand is left exactly as
 * they wrote it, title and class included.
 */
export async function registerFiling(input: {
  companyId: string;
  url: string;
  filing: FilingMeta | null;
  publishedAt: string | null;
}): Promise<RegisterOutcome> {
  const { companyId, url, filing } = input;
  if (!filing) return { ok: false, error: 'no filing metadata: a bound source registers venue filings only' };

  const cls = classifyFiling(filing.form);
  if (!cls) return { ok: false, error: `form ${filing.form} has no document class on the register` };

  const known = await existing(companyId, filing.accession);
  if (known) return { ok: true, documentId: known, created: false };

  const { data, error } = await reportDb
    .from('research_documents')
    .insert<{ id: string }>({
      company_id: companyId,
      venue: 'sec',
      announcement_id: filing.accession,
      pdf_url: url,
      title: filingTitle(filing),
      document_type: cls.documentType,
      source_class: cls.sourceClass,
      is_audited: cls.isAudited,
      published_at: input.publishedAt,
      filing_entity: filing.filerName,
    })
    .select('id')
    .single();

  if (error) {
    // Registered by someone else between the check and the insert: the
    // unique index on (company_id, venue, announcement_id) says so.
    if (error.code === '23505') {
      const raced = await existing(companyId, filing.accession);
      if (raced) return { ok: true, documentId: raced, created: false };
    }
    return { ok: false, error: `research_documents insert: ${error.message}` };
  }
  if (!data) return { ok: false, error: 'research_documents insert returned no row' };
  return { ok: true, documentId: data.id, created: true };
}
