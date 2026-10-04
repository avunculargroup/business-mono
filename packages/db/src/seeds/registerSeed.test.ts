import { describe, expect, it } from 'vitest';
import { CHILD_TABLES, emitCompany, emitRecord, sqlLiteral, type Row } from './registerSeed.js';

const company: Row = {
  id: 'c-1', slug: 'strategy', legal_name: 'Strategy Inc', jurisdiction: 'US-DE',
  operational_hq: null, primary_archetype: 'treasury_company', self_described_archetype: null,
  reporting_standard: 'us_gaap', functional_currency: 'USD', presentation_currency: 'USD',
  financial_year_end: '12-31', tier: 'large', expected_disclosure_cadence: null,
  market_cap_band: null, funding_source: null,
  curator_notes: "It's the holder's own figure", last_verified_at: '2026-09-21',
  review_state: 'internal', reviewed_by: 'tm-1', reviewed_at: '2026-09-22',
  client_cleared: true, client_cleared_by: 'tm-1', client_cleared_at: '2026-09-22',
  client_summary: 'Holds bitcoin directly.', created_by: null, created_at: 'x', updated_at: 'x',
};

const doc: Row = {
  id: 'd-1', company_id: 'c-1', document_type: 'announcement', source_class: 'exchange_announcement',
  title: '8-K', venue: 'sec', announcement_id: '0001050446-26-000123', pdf_url: null,
  published_at: '2026-06-30', filing_entity: null, is_audited: false, retrieved_at: null,
  retrieval_error: null, full_text: 'body', content_sha256: 'abc', page_count: 3, created_at: 'x',
};

const event: Row = {
  id: 'e-1', company_id: 'c-1', event_type: 'policy_adoption', asset_class: 'btc',
  event_date: '2026-06-29', quantity: null, consideration_native: null, native_currency: null,
  fees_included: null, headline: 'Policy', detail: null, disclosure_venue: 'sec',
  filing_entity: null, basis: null, source_document_id: 'd-1',
  natural_key: 'strategy:policy:2026-06-29', created_at: 'x', updated_at: 'x',
};

const finding: Row = {
  id: 'f-1', company_id: 'c-1', finding_type: 'policy_change', is_absence: false, subject: null,
  occurred_on: '2026-06-29', headline: 'Changed', detail: null, materiality: null,
  is_suppressed: false, suppressed_reason: null, event_id: 'e-1', source_document_id: 'd-1',
  natural_key: 'strategy:finding:policy-2026-06-29', created_at: 'x',
};

const listing: Row = {
  id: 'l-1', company_id: 'c-1', venue: 'nasdaq', ticker: 'MSTR', listing_type: 'primary',
  filing_entity: null, listed_from: null, listed_to: null, note: null,
};

const section: Row = {
  id: 's-1', document_id: 'd-1', filing_item: '8-K Item 8.01', source_class: 'exchange_announcement',
  is_filed: true, notes: null, created_at: 'x',
};

function dump(children: Record<string, Row[]>, sections?: Row[]) {
  return emitRecord({ company, children, sections }).sql;
}

describe('registerSeed', () => {
  it('lands the company as a draft and never carries review or clearance', () => {
    const sql = emitCompany(company);
    expect(sql).toMatch(/review_state\)\nSELECT[\s\S]*'draft'\nWHERE NOT EXISTS/);
    expect(sql).not.toContain('client_cleared');
    expect(sql).not.toContain('client_summary');
    expect(sql).not.toContain('internal');
    expect(sql).not.toContain('tm-1');
  });

  it('matches a NULL key column, so a listing with no listed_from is not re-inserted', () => {
    // ON CONFLICT could not do this: the unique key includes listed_from, and
    // NULLs never conflict.
    const sql = dump({ company_listings: [listing] });
    expect(sql).toContain('listed_from IS NOT DISTINCT FROM NULL');
    expect(sql).not.toContain('ON CONFLICT');
  });

  it('resolves a finding\'s event by natural key, not UUID', () => {
    const sql = dump({ research_documents: [doc], treasury_events: [event], research_findings: [finding] });
    expect(sql).toContain("FROM treasury_events WHERE company_id = (SELECT id FROM research_companies WHERE slug = 'strategy') AND natural_key = 'strategy:policy:2026-06-29'");
    expect(sql).not.toContain("'e-1'");
    expect(sql).not.toContain("'d-1'");
  });

  it('emits documents before events before findings', () => {
    const sql = dump({ research_findings: [finding], treasury_events: [event], research_documents: [doc] });
    const at = (t: string) => sql.indexOf(`INSERT INTO ${t}`);
    expect(at('research_documents')).toBeLessThan(at('treasury_events'));
    expect(at('treasury_events')).toBeLessThan(at('research_findings'));
  });

  it('does not carry the document body or anything derived from it', () => {
    const sql = dump({ research_documents: [doc] });
    expect(sql).not.toContain('full_text');
    expect(sql).not.toContain('content_sha256');
  });

  it('lands rows as drafts, never carrying a review from the source database', () => {
    const sql = dump({
      treasury_events: [{ ...event, review_state: 'internal', reviewed_by: 'tm-1', reviewed_at: 'x' }],
      research_documents: [doc],
    });
    const events = sql.slice(sql.indexOf('INSERT INTO treasury_events'));
    expect(events).toContain('INSERT INTO treasury_events');
    expect(events).not.toContain('review_state');
    expect(events).not.toContain('reviewed_');
    expect(sql).not.toContain('tm-1');
  });

  it('throws on a column it does not know, rather than dropping it', () => {
    expect(() => dump({ treasury_events: [{ ...event, review_notes: 'draft' }], research_documents: [doc] }))
      .toThrow(/review_notes/);
    expect(() => emitCompany({ ...company, review_notes: 'draft' })).toThrow(/review_notes/);
  });

  it('throws when a row is sourced to a document outside the record', () => {
    expect(() => dump({ treasury_events: [event] })).toThrow(/references document d-1/);
  });

  it('dollar-quotes text containing apostrophes', () => {
    expect(sqlLiteral("holder's")).toBe("$q$holder's$q$");
    expect(sqlLiteral('a $q$ b\'')).toBe("$qq$a $q$ b'$qq$");
  });

  it('emits sections after their documents and resolves a cited section by filing item', () => {
    const sql = dump(
      { research_documents: [doc], treasury_events: [{ ...event, source_section_id: 's-1' }] },
      [section],
    );
    expect(sql.indexOf('INSERT INTO research_documents')).toBeLessThan(sql.indexOf('INSERT INTO research_document_sections'));
    expect(sql.indexOf('INSERT INTO research_document_sections')).toBeLessThan(sql.indexOf('INSERT INTO treasury_events'));
    expect(sql).toContain("FROM research_document_sections WHERE document_id = (SELECT id FROM research_documents");
    expect(sql).toContain("filing_item = '8-K Item 8.01')");
    expect(sql).not.toContain("'s-1'");
  });

  it('throws when a row cites a section the record does not carry', () => {
    expect(() => dump({ research_documents: [doc], treasury_events: [{ ...event, source_section_id: 's-9' }] }))
      .toThrow(/references section s-9/);
  });

  it('dumps identifiers from their table', () => {
    const sql = dump({
      company_identifiers: [{
        id: 'i-1', company_id: 'c-1', scheme: 'sec_cik', value: '1050446',
        valid_from: null, valid_to: null, note: null, created_at: 'x',
      }],
    });
    expect(sql).toContain('INSERT INTO company_identifiers');
    expect(sql).toContain("scheme IS NOT DISTINCT FROM 'sec_cik' AND value IS NOT DISTINCT FROM '1050446'");
  });

  it('lists every child table in dependency order', () => {
    expect(CHILD_TABLES.map((t) => t.table)).toEqual([
      'company_former_names', 'company_identifiers', 'company_listings', 'research_documents',
      'research_company_facts', 'treasury_events', 'treasury_holdings_snapshots', 'research_findings',
      'secondary_claims',
    ]);
  });
});
