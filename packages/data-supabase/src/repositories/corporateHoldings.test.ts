import { beforeEach, describe, expect, it } from 'vitest';
import { describeCorporateHoldingsContract, testReadContext } from '@platform/data/testing';
import type { Principal, RepositoryDomain } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

/**
 * The corporate holdings adapter, against the same conformance suite the
 * fixture adapter runs.
 *
 * The dataset below is written as the *views* return it — `v_research_ledger`
 * already carries `consideration_aud`, `basis_comparable` and the source
 * columns, and `v_research_freshness` already carries `is_stale`. Recomputing
 * any of that here would test the test.
 */
const principal: Principal = { kind: 'team', userId: 'director-1' };
const ctx = testReadContext();

const listing = (
  venue: string,
  ticker: string,
  listedTo: string | null,
  listingType = 'primary',
) => ({
  venue,
  ticker,
  listing_type: listingType,
  filing_entity: `${ticker} filing entity`,
  listed_from: '2020-01-01',
  listed_to: listedTo,
});

const COMPANIES = [
  {
    id: 'rc-meridian',
    slug: 'demo-meridian-freight',
    legal_name: 'Meridian Freight Group Limited',
    jurisdiction: 'NZ',
    tier: 'regional',
    primary_archetype: 'treasury_allocation',
    self_described_archetype: 'treasury_company',
    reporting_standard: 'nz_ifrs',
    expected_disclosure_cadence: 'episodic',
    acn: '000 000 001',
    abn: '00 000 000 001',
    arbn: null,
    isin: 'XX0000000001',
    operational_hq: 'New South Wales',
    functional_currency: 'AUD',
    presentation_currency: 'NZD',
    financial_year_end: '06-30',
    market_cap_band: 'micro',
    funding_source: 'operating_cash',
    curator_notes: 'Two venues, two filing entities.',
    last_verified_at: '2026-08-15',
    is_published: true,
    // The venue it left is still in the history, which is where half its
    // filings are. Rule 3, as data.
    company_listings: [listing('asx', 'MFGX', '2025-12-17'), listing('nzx', 'MFGX', null)],
    company_former_names: [{ name: 'Parcelway Technologies Limited', used_to: '2025-05-19' }],
  },
  {
    id: 'rc-verrall',
    slug: 'demo-verrall-dam',
    legal_name: 'Verrall Digital Asset Management Limited',
    jurisdiction: 'AU',
    tier: 'regional',
    primary_archetype: 'native_exposure',
    self_described_archetype: null,
    reporting_standard: 'aasb',
    expected_disclosure_cadence: 'monthly',
    acn: '000 000 002',
    abn: '00 000 000 002',
    arbn: null,
    isin: 'XX0000000002',
    operational_hq: 'Western Australia',
    functional_currency: 'AUD',
    presentation_currency: 'AUD',
    financial_year_end: '06-30',
    market_cap_band: 'small',
    funding_source: 'balance_sheet',
    curator_notes: 'Holds units in a fund it manages.',
    last_verified_at: '2026-08-15',
    is_published: true,
    company_listings: [listing('asx', 'VRDM', null)],
    company_former_names: [],
  },
  {
    id: 'rc-tarra',
    slug: 'demo-tarra-holdings',
    legal_name: 'Tarra Holdings Limited',
    jurisdiction: 'AU',
    tier: 'regional',
    primary_archetype: 'treasury_allocation',
    self_described_archetype: null,
    reporting_standard: 'aasb',
    expected_disclosure_cadence: 'episodic',
    acn: '000 000 004',
    abn: '00 000 000 004',
    arbn: null,
    isin: 'XX0000000004',
    operational_hq: 'Victoria',
    functional_currency: 'AUD',
    presentation_currency: 'AUD',
    financial_year_end: '06-30',
    market_cap_band: 'micro',
    funding_source: 'operating_cash',
    curator_notes: 'A policy, one acquisition, then nothing.',
    last_verified_at: '2026-08-15',
    is_published: true,
    company_listings: [listing('asx', 'TARH', null)],
    company_former_names: [],
  },
  {
    id: 'rc-calder',
    slug: 'demo-calder-capital',
    legal_name: 'Calder Capital Limited',
    jurisdiction: 'AU',
    tier: 'regional',
    primary_archetype: 'native_exposure',
    self_described_archetype: null,
    reporting_standard: 'aasb',
    expected_disclosure_cadence: 'monthly',
    acn: '000 000 005',
    abn: '00 000 000 005',
    arbn: null,
    isin: 'XX0000000005',
    operational_hq: 'Queensland',
    functional_currency: 'AUD',
    presentation_currency: 'AUD',
    financial_year_end: '06-30',
    market_cap_band: 'micro',
    funding_source: 'equity_issuance',
    curator_notes: 'Committed to monthly disclosure and went quiet.',
    last_verified_at: '2026-05-14',
    is_published: true,
    company_listings: [listing('asx', 'CLDR', null)],
    company_former_names: [],
  },
];

const source = (id: string, title: string, sourceClass: string, audited = false) => ({
  source_document_id: id,
  source_title: title,
  source_class: sourceClass,
  source_url: `/fixtures/docs/${id}.pdf`,
  source_published_at: '2026-04-22',
  source_is_audited: audited,
});

const LEDGER = [
  {
    id: 'evt-mfg-005',
    company_id: 'rc-meridian',
    event_type: 'capital_posture_change',
    asset_class: 'btc',
    event_date: '2026-04-20',
    quantity: null,
    consideration_native: null,
    native_currency: null,
    consideration_aud: null,
    fx_rate_used: null,
    fees_included: null,
    headline: 'Buyback running while the issuance facility sits undrawn',
    detail: null,
    disclosure_venue: 'nzx',
    basis: null,
    basis_comparable: null,
    classification: 'publishable',
    ...source('doc-mfg-4c', 'Quarterly cash flow report', 'exchange_announcement'),
  },
  {
    id: 'evt-mfg-003',
    company_id: 'rc-meridian',
    event_type: 'covenant_change',
    asset_class: 'btc',
    event_date: '2025-08-14',
    quantity: null,
    consideration_native: 500000,
    native_currency: 'AUD',
    consideration_aud: 500000,
    fx_rate_used: null,
    fees_included: null,
    headline: 'Cash covenant amended to admit bitcoin',
    detail: null,
    disclosure_venue: 'asx',
    basis: null,
    basis_comparable: null,
    // Reads on credit quality. Held internal, and therefore absent from the
    // publishable view below.
    classification: 'internal',
    ...source('doc-mfg-offer', 'Offer document', 'regulated_disclosure', true),
  },
  {
    id: 'evt-mfg-002',
    company_id: 'rc-meridian',
    event_type: 'acquisition',
    asset_class: 'btc',
    event_date: '2025-06-04',
    quantity: 6.08914,
    consideration_native: 1000000,
    native_currency: 'AUD',
    consideration_aud: 1000000,
    fx_rate_used: null,
    fees_included: true,
    headline: 'First acquisition',
    detail: 'Inclusive of fees and expenses.',
    disclosure_venue: 'asx',
    basis: 'direct_spot',
    basis_comparable: true,
    classification: 'publishable',
    ...source('doc-mfg-ann-004', 'Treasury update', 'exchange_announcement'),
  },
];

const POSITIONS = [
  {
    snapshot_id: 'pos-vrdm-spot',
    company_id: 'rc-verrall',
    as_of_date: '2026-06-30',
    asset: 'btc',
    instrument_type: 'spot',
    quantity: 308.8,
    basis: 'direct_spot',
    basis_comparable: true,
    look_through_btc_equivalent: null,
    is_related_party_vehicle: false,
    includes_customer_assets: false,
    ...source('doc-vrdm-monthly', 'Monthly treasury holdings', 'exchange_announcement'),
  },
  {
    snapshot_id: 'pos-vrdm-units',
    company_id: 'rc-verrall',
    as_of_date: '2026-06-30',
    asset: 'btc',
    instrument_type: 'fund_units',
    quantity: 889367,
    basis: 'look_through',
    basis_comparable: false,
    look_through_btc_equivalent: 194.85,
    is_related_party_vehicle: true,
    includes_customer_assets: false,
    ...source('doc-vrdm-monthly', 'Monthly treasury holdings', 'exchange_announcement'),
  },
  {
    snapshot_id: 'pos-vrdm-sol',
    company_id: 'rc-verrall',
    as_of_date: '2026-06-30',
    asset: 'sol',
    instrument_type: 'spot',
    quantity: 41200,
    basis: 'direct_spot',
    basis_comparable: true,
    look_through_btc_equivalent: null,
    is_related_party_vehicle: false,
    includes_customer_assets: false,
    ...source('doc-vrdm-monthly', 'Monthly treasury holdings', 'exchange_announcement'),
  },
];

const FRESHNESS = [
  {
    id: 'rc-meridian',
    slug: 'demo-meridian-freight',
    expected_disclosure_cadence: 'episodic',
    latest_document_at: '2026-04-22',
    days_since_document: 61,
    stale_after_days: 240,
    is_stale: false,
  },
  {
    id: 'rc-verrall',
    slug: 'demo-verrall-dam',
    expected_disclosure_cadence: 'monthly',
    latest_document_at: '2026-06-12',
    days_since_document: 12,
    stale_after_days: 45,
    is_stale: false,
  },
  // The pair the cadence rule exists for: 210 quiet days is fine for an
  // episodic discloser, 92 is overdue for one that promised monthly.
  {
    id: 'rc-tarra',
    slug: 'demo-tarra-holdings',
    expected_disclosure_cadence: 'episodic',
    latest_document_at: '2025-11-20',
    days_since_document: 210,
    stale_after_days: 240,
    is_stale: false,
  },
  {
    id: 'rc-calder',
    slug: 'demo-calder-capital',
    expected_disclosure_cadence: 'monthly',
    latest_document_at: '2026-03-20',
    days_since_document: 92,
    stale_after_days: 45,
    is_stale: true,
  },
];

const ABSENCES = [
  {
    company_id: 'rc-verrall',
    subject: 'covenants',
    headline: 'No financing facilities at quarter end',
    detail:
      'No financing facilities at quarter end, per the financing facilities item of the ' +
      'quarterly cash flow report. There is no covenant to report because there is no debt.',
    ...source('doc-vrdm-4c', 'Quarterly cash flow report', 'exchange_announcement'),
  },
];

const NOTES = [
  {
    id: 'jn-revaluation',
    note_key: 'aasb_138_revaluation',
    topic: 'accounting',
    title: 'AASB 138 and the revaluation model',
    body: 'Cost model or revaluation model.',
    rule_reference: 'AASB 138, paragraphs 72-87',
    primary_source_url: null,
    applies_to_standard: 'aasb',
    applies_to_venue: null,
    applies_to_listing_type: null,
    verified_at: null,
    is_published: false,
  },
  {
    id: 'jn-cash-box',
    note_key: 'asx_lr_12_3',
    topic: 'listing_rules',
    title: 'The two limbs of the cash-box test',
    body: 'Uncommitted, not liquid, is the test.',
    rule_reference: 'Listing Rule 12.3',
    primary_source_url: null,
    applies_to_standard: null,
    applies_to_venue: 'asx',
    applies_to_listing_type: null,
    verified_at: null,
    is_published: false,
  },
];

function seed(): FakeSupabaseClient {
  const client = createFakeSupabase();
  client.__setDataset('research_companies', COMPANIES);
  client.__setDataset('v_research_ledger', LEDGER);
  // The publishable view is a different query, not a filter over the same
  // rows — so it is a different dataset here, and the covenant row is not in it.
  client.__setDataset(
    'v_research_publishable',
    LEDGER.filter((row) => row.classification === 'publishable'),
  );
  client.__setDataset('v_company_position', POSITIONS);
  client.__setDataset('v_research_freshness', FRESHNESS);
  client.__setDataset('v_research_absences', ABSENCES);
  client.__setDataset('jurisdiction_notes', NOTES);
  return client;
}

describeCorporateHoldingsContract<RepositoryDomain>({
  name: 'supabase',
  createBundle: () =>
    createSupabaseRepositories(seed() as unknown as PlatformSupabaseClient, principal),
  mixedBasisSlug: 'demo-verrall-dam',
  noDebtSlug: 'demo-verrall-dam',
  mismatchedPair: ['demo-meridian-freight', 'demo-verrall-dam'],
  matchedPair: ['demo-meridian-freight', 'demo-tarra-holdings'],
  staleSlug: 'demo-calder-capital',
  quietSlug: 'demo-tarra-holdings',
  mixedClassificationSlug: 'demo-meridian-freight',
});

let client: FakeSupabaseClient;

function corporateHoldings() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .corporateHoldings;
}

beforeEach(() => {
  client = seed();
});

describe('query wiring', () => {
  it('reads the publishable view rather than filtering the ledger view', async () => {
    await corporateHoldings().getLedger(ctx, 'rc-meridian', { publishableOnly: true });

    expect(client.__buildersFor('v_research_publishable')).toHaveLength(1);
    expect(client.__buildersFor('v_research_ledger')).toHaveLength(0);
  });

  it('pushes the register filters into the query', async () => {
    // Filtering in the page would page wrongly: `total` would count rows the
    // page then discarded.
    await corporateHoldings().listCompanies(ctx, {
      tier: 'regional',
      archetype: 'native_exposure',
    });

    const [builder] = client.__buildersFor('research_companies');
    expect(builder.eq).toHaveBeenCalledWith('tier', 'regional');
    expect(builder.eq).toHaveBeenCalledWith('primary_archetype', 'native_exposure');
  });

  it('reports the register total separately from the page', async () => {
    const page = await corporateHoldings().listCompanies(ctx, undefined, { limit: 2 });

    expect(page.items).toHaveLength(2);
    expect(page.total).toBe(COMPANIES.length);
    expect(page.hasMore).toBe(true);
  });

  it('splits current listings from the venues a company has left', async () => {
    const company = await corporateHoldings().getCompany(ctx, 'demo-meridian-freight');

    expect(company?.listings.map((l) => l.venue)).toEqual(['nzx']);
    expect(company?.listingHistory.map((l) => l.venue)).toEqual(['asx', 'nzx']);
  });

  it('joins a jurisdiction note on the dimensions a company actually has', async () => {
    const notes = await corporateHoldings().getJurisdictionNotes(ctx, {
      standard: 'aasb',
      venue: 'asx',
      listingType: 'primary',
    });

    expect(notes.map((note) => note.noteKey).sort()).toEqual([
      'aasb_138_revaluation',
      'asx_lr_12_3',
    ]);
  });

  it('leaves a note off a panel whose standard does not match', async () => {
    const notes = await corporateHoldings().getJurisdictionNotes(ctx, {
      standard: 'us_gaap',
      venue: 'nyse',
    });

    expect(notes).toHaveLength(0);
  });

  it('keeps a second asset out of the bitcoin aggregate', async () => {
    // A treasury holding two assets has two positions, not one larger one.
    const position = await corporateHoldings().getPosition(ctx, 'rc-verrall');

    expect(position.comparableTotal).toBeCloseTo(308.8, 8);
    expect(position.rows.some((row) => row.asset === 'sol')).toBe(true);
  });
});
