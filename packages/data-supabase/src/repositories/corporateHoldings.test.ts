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

const BASE_COMPANIES = [
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
    company_identifiers: [{ scheme: 'isin', value: 'XX0000000001', valid_from: null, valid_to: null }],
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
    company_identifiers: [],
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
    company_identifiers: [],
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
    company_identifiers: [],
  },
];

/** A record with no stated status columns reads as the view returns it: assessed, active. */
const company = (
  id: string,
  slug: string,
  legalName: string,
  ticker: string,
  status: {
    ledger_absence_reason?: string | null;
    holding_status?: string | null;
    exited_on?: string | null;
  },
) => ({
  id,
  slug,
  legal_name: legalName,
  jurisdiction: 'AU',
  tier: 'regional',
  primary_archetype: 'treasury_allocation',
  self_described_archetype: null,
  reporting_standard: 'aasb',
  expected_disclosure_cadence: 'episodic',
  operational_hq: null,
  functional_currency: 'AUD',
  presentation_currency: 'AUD',
  financial_year_end: '06-30',
  market_cap_band: 'micro',
  funding_source: 'operating_cash',
  curator_notes: null,
  last_verified_at: '2026-08-15',
  is_published: true,
  ledger_absence_reason: null,
  holding_status: null,
  exited_on: null,
  ...status,
  company_listings: [listing('asx', ticker, null)],
  company_former_names: [],
  company_identifiers: [],
});

const COMPANIES = [
  ...BASE_COMPANIES.map((row) => ({
    ledger_absence_reason: null,
    holding_status: 'active',
    exited_on: null,
    ...row,
  })),
  // The four shapes records 4–12 added. Same slugs as the fixture adapter's.
  company('rc-halden', 'demo-halden-foods', 'Halden Foods Limited', 'HLDF', {
    holding_status: 'active',
  }),
  company('rc-corran', 'demo-corran-minerals', 'Corran Minerals Limited', 'CRNM', {
    ledger_absence_reason: 'no_stated_basis',
  }),
  company('rc-ashby', 'demo-ashby-media', 'Ashby Media Group Limited', 'ASHM', {
    ledger_absence_reason: 'source_class_refused',
  }),
  company('rc-wexford', 'demo-wexford-semiconductor', 'Wexford Semiconductor Limited', 'WXFS', {
    holding_status: 'exited',
    exited_on: '2026-08-14',
  }),
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
  ...[
    // A purchase and a sale that leave the balance close to where it was.
    ledgerRow('evt-vrdm-004', 'rc-verrall', 'disposal', '2026-06-12', 36.5, 5840000),
    ledgerRow('evt-vrdm-003', 'rc-verrall', 'acquisition', '2026-05-13', 40, 6200000),
    // Quantity and nothing else: no price, no proceeds, no settlement date.
    ledgerRow('evt-wxfs-002', 'rc-wexford', 'disposal', '2026-08-14', 150, null),
    ledgerRow('evt-wxfs-001', 'rc-wexford', 'acquisition', '2025-05-11', 150, 14100000),
  ],
];

function ledgerRow(
  id: string,
  companyId: string,
  eventType: 'acquisition' | 'disposal',
  eventDate: string,
  quantity: number,
  considerationAud: number | null,
) {
  return {
    id,
    company_id: companyId,
    event_type: eventType,
    asset_class: 'btc',
    event_date: eventDate,
    quantity,
    consideration_native: considerationAud,
    native_currency: considerationAud === null ? null : 'AUD',
    consideration_aud: considerationAud,
    fx_rate_used: null,
    fees_included: null,
    headline: eventType === 'acquisition' ? 'Acquisition' : 'Disposal',
    detail: null,
    disclosure_venue: 'asx',
    basis: 'direct_spot',
    basis_comparable: true,
    classification: 'publishable',
    ...source(`doc-${id}`, 'Treasury update', 'exchange_announcement'),
  };
}

const BASE_POSITIONS = [
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

const position = (
  snapshotId: string,
  companyId: string,
  quantity: number,
  extra: Record<string, unknown> = {},
) => ({
  snapshot_id: snapshotId,
  company_id: companyId,
  as_of_date: '2026-06-30',
  asset: 'btc',
  instrument_type: 'spot',
  quantity,
  basis: 'direct_spot',
  basis_comparable: true,
  look_through_btc_equivalent: null,
  is_related_party_vehicle: false,
  includes_customer_assets: false,
  encumbered_quantity: null,
  encumbrance_counterparty: null,
  encumbrance_obligation: null,
  ...source(`doc-${snapshotId}`, 'Holdings statement', 'exchange_announcement'),
  ...extra,
});

const POSITIONS = [
  ...BASE_POSITIONS.map((row) => ({
    encumbered_quantity: null,
    encumbrance_counterparty: null,
    encumbrance_obligation: null,
    ...row,
  })),
  position('pos-mfg-spot', 'rc-meridian', 12.3),
  position('pos-tarh-spot', 'rc-tarra', 2.5),
  // Pledged, not sold: still comparable, and not free.
  position('pos-cldr-spot', 'rc-calder', 61.4, {
    encumbered_quantity: 20,
    encumbrance_counterparty: 'Secured term lender',
    encumbrance_obligation: 'A term loan drawn to fund an acquisition outside the treasury',
  }),
  position('pos-hldf-etf', 'rc-halden', 18500, {
    instrument_type: 'fund_units',
    basis: 'etf_wrapped',
    basis_comparable: false,
  }),
  position('pos-wxfs-spot', 'rc-wexford', 0, { as_of_date: '2026-08-14' }),
];

/**
 * As `secondary_claims` stores them. One tracker 28% low, one in agreement —
 * on Verrall, whose fund units and second asset are what a claim must not be
 * measured against.
 */
const TRACKER_CLAIMS = [
  {
    company_id: 'rc-verrall',
    source_name: 'Treasury tracker A',
    source_url: '/fixtures/docs/tracker-a.html',
    claimed_quantity: 222.3,
    claimed_as_of: '2025-09-01',
    observed_at: '2026-06-20',
    note: 'Stamped nine months before the latest monthly statement.',
  },
  {
    company_id: 'rc-verrall',
    source_name: 'Treasury tracker B',
    source_url: '/fixtures/docs/tracker-b.html',
    claimed_quantity: 308.8,
    claimed_as_of: '2026-06-01',
    observed_at: '2026-06-19',
    note: null,
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

// Meridian's About page against its offer document. The view has already
// picked the winner and attached the loser, which is what these rows are.
const FACTS = [
  {
    id: 'fact-mfg-custody',
    company_id: 'rc-meridian',
    field_key: 'custody',
    label: 'Custody',
    value: 'Held with an institutional custodian, in segregated accounts, uninsured.',
    as_of: '2025-11-03',
    ...source('doc-mfg-offer', 'Offer document', 'regulated_disclosure', true),
    conflicting_value: 'The About page states self-custody with no counterparty risk.',
    conflicting_source_title: 'About us',
    conflicting_source_class: 'company_web',
    conflicting_source_url: '/fixtures/docs/mfg-about.html',
  },
  {
    id: 'fact-vrdm-custody',
    company_id: 'rc-verrall',
    field_key: 'custody',
    label: 'Custody',
    value: 'Not disclosed for the balance sheet.',
    as_of: '2026-06-12',
    ...source('doc-vrdm-4c', 'Quarterly cash flow report', 'exchange_announcement'),
    conflicting_value: null,
    conflicting_source_title: null,
    conflicting_source_class: null,
    conflicting_source_url: null,
  },
];

const WITHHELD = [
  {
    company_id: 'rc-meridian',
    subject_table: 'research_companies',
    subject_id: 'rc-meridian',
    field_key: 'unrealised_position',
    classification: 'restricted',
    reason: 'Position against cost basis is a valuation output.',
  },
  {
    company_id: 'rc-meridian',
    subject_table: 'research_companies',
    subject_id: 'rc-meridian',
    field_key: 'curator_notes',
    classification: 'internal',
    reason: 'Working material, not a client-facing claim.',
  },
  // A company-disclosed statistic, citable with its date. On the table so the
  // `in` filter has something to exclude.
  {
    company_id: 'rc-meridian',
    subject_table: 'research_companies',
    subject_id: 'rc-meridian',
    field_key: 'disclosed_market_cap_proportion',
    classification: 'publishable',
    reason: 'A company-disclosed statistic is citable with its date.',
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
  client.__setDataset('v_company_facts', FACTS);
  client.__setDataset('research_classifications', WITHHELD);
  client.__setDataset('jurisdiction_notes', NOTES);
  client.__setDataset('secondary_claims', TRACKER_CLAIMS);
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
  sourceConflictSlug: 'demo-meridian-freight',
  flowsSlug: 'demo-verrall-dam',
  currencyOnlySlug: 'demo-corran-minerals',
  etfWrappedSlug: 'demo-halden-foods',
  encumberedSlug: 'demo-calder-capital',
  refusedByClassSlug: 'demo-ashby-media',
  trackerDivergenceSlug: 'demo-verrall-dam',
  exitedSlug: 'demo-wexford-semiconductor',
  activeSlug: 'demo-tarra-holdings',
  disposalWithoutConsiderationSlug: 'demo-wexford-semiconductor',
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

  it('selects the encumbrance columns from the position view', async () => {
    // The columns were on the snapshots table a migration before they were on
    // the view; a select that names them is what keeps a pledge from being
    // stored and never shown.
    await corporateHoldings().getPosition(ctx, 'rc-calder');

    const [builder] = client.__buildersFor('v_company_position');
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('encumbered_quantity'));
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining('encumbrance_obligation'));
  });

  it('reads tracker claims from secondary_claims and nowhere else feeds them', async () => {
    const claims = await corporateHoldings().getTrackerClaims(ctx, 'rc-verrall');

    const [builder] = client.__buildersFor('secondary_claims');
    expect(builder.eq).toHaveBeenCalledWith('company_id', 'rc-verrall');
    expect(claims.map((claim) => claim.sourceName)).toEqual([
      'Treasury tracker A',
      'Treasury tracker B',
    ]);
    // Measured against the direct holding alone: not the fund units, not the
    // second asset.
    expect(claims[0].sourcedQuantity).toBe(308.8);
    expect(claims[0].divergence).toBeCloseTo((222.3 - 308.8) / 308.8, 10);
  });

  it('does not read the position for a company no tracker has claimed', async () => {
    await expect(corporateHoldings().getTrackerClaims(ctx, 'rc-tarra')).resolves.toEqual([]);
    expect(client.__buildersFor('v_company_position')).toHaveLength(0);
  });

  it('splits current listings from the venues a company has left', async () => {
    const company = await corporateHoldings().getCompany(ctx, 'demo-meridian-freight');

    expect(company?.listings.map((l) => l.venue)).toEqual(['nzx']);
    expect(company?.listingHistory.map((l) => l.venue)).toEqual(['asx', 'nzx']);
  });

  it('reads identifiers from company_identifiers, not from a column per scheme', async () => {
    const company = await corporateHoldings().getCompany(ctx, 'demo-meridian-freight');

    expect(company?.identifiers).toEqual([
      { scheme: 'isin', value: 'XX0000000001', validFrom: null, validTo: null },
    ]);
    expect(company).not.toHaveProperty('isin');
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

  it('leaves a publishable company-level field off the withheld list', async () => {
    // The panel names what was withheld. A publishable field on it would be a
    // page claiming to have declined something it published.
    const withheld = await corporateHoldings().getWithheldFields(ctx, 'rc-meridian');

    expect(withheld.map((field) => field.fieldKey)).not.toContain(
      'disclosed_market_cap_proportion',
    );
  });

  it('keeps a second asset out of the bitcoin aggregate', async () => {
    // A treasury holding two assets has two positions, not one larger one.
    const position = await corporateHoldings().getPosition(ctx, 'rc-verrall');

    expect(position.comparableTotal).toBeCloseTo(308.8, 8);
    expect(position.rows.some((row) => row.asset === 'sol')).toBe(true);
  });
});
