/**
 * @bts/data-fixtures — Corporate Research
 *
 * Wholly fictional entities. Not anonymised real companies.
 * Every identifier here is deliberately invalid: ABNs and ACNs carry failing
 * check digits, ISINs use the reserved XX prefix, and tickers are four letters
 * where ASX and NZX codes are three. If a fixture ever reaches production
 * ingest it will fail validation rather than resolve to something real.
 *
 * Each record exists to carry one pathology found in the research dossiers.
 * A clean fixture set demonstrates nothing.
 */

// ---------------------------------------------------------------------------
// Types — mirror packages/data. Provenance is required, not optional.
// ---------------------------------------------------------------------------

export type Archetype =
  | 'treasury_allocation'
  | 'treasury_company'
  | 'native_exposure'
  | 'operational_integration';

export type Tier = 'regional' | 'peer_shaped' | 'bellwether';
export type ListingType = 'primary' | 'secondary' | 'cdi_foreign_exempt';
export type ReportingStandard = 'aasb' | 'nz_ifrs' | 'us_gaap' | 'sfrs' | 'ifrs';
export type Cadence = 'monthly' | 'quarterly' | 'episodic';

export type SourceClass =
  | 'regulated_disclosure'
  | 'exchange_announcement'
  | 'audited_accounts'
  | 'investor_presentation'
  | 'company_web'
  | 'secondary';

/** Open vocabulary. Four values discovered empirically; assume a fifth exists. */
export type HoldingBasis =
  | 'direct_spot'
  | 'look_through'
  | 'includes_customer_assets'
  | 'stated_unreconciled';

/** Only these may enter an aggregate. Enforced in data, not in comments. */
export const COMPARABLE_BASES: ReadonlySet<HoldingBasis> = new Set(['direct_spot']);

export type EventType =
  | 'policy_adoption'
  | 'acquisition'
  | 'disposal'
  | 'capital_raise'
  | 'covenant_change'
  | 'capital_posture_change'
  | 'custody_change'
  | 'listing_change'
  | 'accounting_election';

/**
 * Provenance is a required field on every fact-bearing type.
 * A type that permits a fact without a source permits the bug the
 * feature exists to prevent.
 */
export interface Provenance {
  documentId: string;
  documentTitle: string;
  sourceClass: SourceClass;
  sourceUrl: string;          // fixtures resolve to a local static file
  publishedAt: string;        // ISO date
  isAudited: boolean;
  page?: string;
}

export interface Listing {
  venue: string;
  ticker: string;
  listingType: ListingType;
  filingEntity: string;
  listedFrom: string;
  listedTo: string | null;
}

export interface LedgerEntry {
  id: string;
  companyId: string;
  eventType: EventType;
  assetClass: string;
  eventDate: string;
  quantity: number | null;
  considerationNative: number | null;
  nativeCurrency: string | null;
  feesIncluded: boolean | null;
  headline: string;
  detail: string;
  basis: HoldingBasis | null;
  disclosureVenue: string;
  classification: 'publishable' | 'internal' | 'restricted';
  provenance: Provenance;
}

export interface HoldingRow {
  asOfDate: string;
  asset: string;
  instrumentType: 'spot' | 'fund_units' | 'spc_investment' | 'tokenised_fund' | 'other';
  quantity: number;
  basis: HoldingBasis;
  lookThroughBtcEquivalent: number | null;
  isRelatedPartyVehicle: boolean;
  includesCustomerAssets: boolean;
  provenance: Provenance;
}

export interface ResearchCompany {
  id: string;
  slug: string;
  legalName: string;
  formerNames: { name: string; usedTo: string }[];
  listings: Listing[];
  jurisdiction: string;
  primaryArchetype: Archetype;
  selfDescribedArchetype: Archetype | null;
  reportingStandard: ReportingStandard;
  functionalCurrency: string;
  presentationCurrency: string;
  tier: Tier;
  expectedDisclosureCadence: Cadence;
  curatorNotes: string;
  lastVerifiedAt: string;
  /** Rejected by the Supabase adapter's insert path. */
  isFixture: true;
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

const MFG_PDS: Provenance = {
  documentId: 'doc-mfg-pds',
  documentTitle: 'Meridian Freight Group — Product Disclosure Statement',
  sourceClass: 'regulated_disclosure',
  sourceUrl: '/fixtures/docs/mfg-pds.pdf',
  publishedAt: '2025-11-03',
  isAudited: true,
};

const MFG_ANN_TREASURY: Provenance = {
  documentId: 'doc-mfg-ann-004',
  documentTitle: 'Treasury Update',
  sourceClass: 'exchange_announcement',
  sourceUrl: '/fixtures/docs/mfg-ann-004.pdf',
  publishedAt: '2025-06-04',
  isAudited: false,
};

const MFG_Q3: Provenance = {
  documentId: 'doc-mfg-q3fy26',
  documentTitle: 'Q3 FY26 Investor Presentation',
  sourceClass: 'investor_presentation',
  sourceUrl: '/fixtures/docs/mfg-q3fy26.pdf',
  publishedAt: '2026-04-22',
  isAudited: false,
};

/** Below the minimum class for a custody field. Present so the UI can show it losing. */
export const MFG_WEB: Provenance = {
  documentId: 'doc-mfg-web-about',
  documentTitle: 'Meridian Freight — About us',
  sourceClass: 'company_web',
  sourceUrl: '/fixtures/docs/mfg-about.html',
  publishedAt: '2026-02-10',
  isAudited: false,
};

// ---------------------------------------------------------------------------
// 1. Meridian Freight Group — the flagship. Operating business, migrated venue,
//    covenant amended to admit bitcoin, custody claim contradicted by its own PDS.
// ---------------------------------------------------------------------------

export const meridianFreight: ResearchCompany = {
  id: 'cmp-mfg',
  slug: 'demo-meridian-freight',
  legalName: 'Meridian Freight Group Limited',
  formerNames: [{ name: 'Parcelway Technologies Limited', usedTo: '2025-05-19' }],
  listings: [
    { venue: 'asx', ticker: 'MFGX', listingType: 'primary',
      filingEntity: 'Meridian Freight Group Limited (AU)',
      listedFrom: '2021-09-14', listedTo: '2025-12-17' },
    { venue: 'nzx', ticker: 'MFGX', listingType: 'primary',
      filingEntity: 'Meridian Freight Group Limited (NZ)',
      listedFrom: '2025-12-03', listedTo: null },
  ],
  jurisdiction: 'NZ',
  primaryArchetype: 'treasury_allocation',
  selfDescribedArchetype: 'treasury_company',
  reportingStandard: 'nz_ifrs',
  functionalCurrency: 'AUD',
  presentationCurrency: 'NZD',
  tier: 'regional',
  expectedDisclosureCadence: 'episodic',
  curatorNotes:
    'Ledger splits across two venues and two filing entities. A name-keyed search ' +
    'loses everything before the rename. The About page contradicts the offer ' +
    'document on custody; the offer document wins and the conflict is displayed ' +
    'rather than resolved silently.',
  lastVerifiedAt: '2026-08-12',
  isFixture: true,
};

export const meridianLedger: LedgerEntry[] = [
  {
    id: 'evt-mfg-001', companyId: 'cmp-mfg',
    eventType: 'policy_adoption', assetClass: 'btc',
    eventDate: '2025-01-28',
    quantity: null, considerationNative: null, nativeCurrency: null, feesIncluded: null,
    headline: 'Treasury Management Policy adopted',
    detail:
      'Bitcoin only. Acquisition permitted where forecast cash meets operational ' +
      'obligations and lender covenants with a buffer above both. Dual authorisation ' +
      'by at least two directors or senior executives.',
    basis: null, disclosureVenue: 'asx', classification: 'publishable',
    provenance: { ...MFG_PDS, page: 'p.12' },
  },
  {
    id: 'evt-mfg-002', companyId: 'cmp-mfg',
    eventType: 'acquisition', assetClass: 'btc',
    eventDate: '2025-06-04',
    quantity: 6.08914, considerationNative: 1_000_000, nativeCurrency: 'AUD',
    feesIncluded: true,
    headline: 'First acquisition',
    detail: 'A$164,227 average per bitcoin, inclusive of fees and expenses.',
    basis: 'direct_spot', disclosureVenue: 'asx', classification: 'publishable',
    provenance: MFG_ANN_TREASURY,
  },
  {
    id: 'evt-mfg-003', companyId: 'cmp-mfg',
    eventType: 'covenant_change', assetClass: 'btc',
    eventDate: '2025-08-14',
    quantity: null, considerationNative: null, nativeCurrency: null, feesIncluded: null,
    headline: 'Cash covenant amended to admit bitcoin',
    detail:
      'The replacement covenant requires a minimum bitcoin balance of A$500,000, ' +
      'with aggregate cash and bitcoin of at least A$1.35m. The offer document ' +
      'states the change was made in recognition of the bitcoin adoption.',
    basis: null, disclosureVenue: 'asx',
    // Reads on credit quality. Lex holds it internal.
    classification: 'internal',
    provenance: { ...MFG_PDS, page: 'p.16' },
  },
  {
    id: 'evt-mfg-004', companyId: 'cmp-mfg',
    eventType: 'listing_change', assetClass: 'btc',
    eventDate: '2025-12-17',
    quantity: null, considerationNative: null, nativeCurrency: null, feesIncluded: null,
    headline: 'Listing migration complete',
    detail:
      'Top-hat scheme of arrangement. Operations remained in New South Wales. ' +
      'The prior venue applies a cash-box test the new venue does not.',
    basis: null, disclosureVenue: 'nzx', classification: 'publishable',
    provenance: MFG_PDS,
  },
  {
    id: 'evt-mfg-005', companyId: 'cmp-mfg',
    eventType: 'capital_posture_change', assetClass: 'btc',
    eventDate: '2026-04-20',
    quantity: null, considerationNative: null, nativeCurrency: null, feesIncluded: null,
    headline: 'On-market buyback announced while issuance facility undrawn',
    detail:
      'No at-the-market capital drawn during the March quarter. The accumulation ' +
      'facility and the buyback point in opposite directions on the share register.',
    basis: null, disclosureVenue: 'nzx', classification: 'publishable',
    provenance: MFG_Q3,
  },
];

export const meridianHoldings: HoldingRow[] = [
  {
    asOfDate: '2026-03-31', asset: 'btc', instrumentType: 'spot',
    quantity: 12.3, basis: 'direct_spot',
    lookThroughBtcEquivalent: null,
    isRelatedPartyVehicle: false, includesCustomerAssets: false,
    provenance: MFG_Q3,
  },
];

// ---------------------------------------------------------------------------
// 2. Kestrel — funds manager. Look-through into a fund it manages itself,
//    multi-asset treasury, no debt at all.
// ---------------------------------------------------------------------------

const KDM_MONTHLY: Provenance = {
  documentId: 'doc-kdm-2026-06',
  documentTitle: 'June 2026 Treasury Holdings',
  sourceClass: 'exchange_announcement',
  sourceUrl: '/fixtures/docs/kdm-2026-06.pdf',
  publishedAt: '2026-07-14',
  isAudited: false,
};

export const kestrelDam: ResearchCompany = {
  id: 'cmp-kdm',
  slug: 'demo-kestrel-dam',
  legalName: 'Kestrel Digital Asset Management Limited',
  formerNames: [],
  listings: [
    { venue: 'asx', ticker: 'KDAM', listingType: 'primary',
      filingEntity: 'Kestrel Digital Asset Management Limited',
      listedFrom: '2016-03-02', listedTo: null },
  ],
  jurisdiction: 'AU',
  primaryArchetype: 'native_exposure',
  selfDescribedArchetype: null,
  reportingStandard: 'aasb',
  functionalCurrency: 'AUD',
  presentationCurrency: 'AUD',
  tier: 'regional',
  expectedDisclosureCadence: 'monthly',
  curatorNotes:
    'Holds units in a fund it manages. Look-through and direct holdings must never ' +
    'be silently summed. No debt, so covenant findings return structural absence ' +
    'rather than an empty panel. Not comparable with an operating business.',
  lastVerifiedAt: '2026-08-12',
  isFixture: true,
};

export const kestrelHoldings: HoldingRow[] = [
  {
    asOfDate: '2026-06-30', asset: 'btc', instrumentType: 'spot',
    quantity: 308.8, basis: 'direct_spot',
    lookThroughBtcEquivalent: null,
    isRelatedPartyVehicle: false, includesCustomerAssets: false,
    provenance: KDM_MONTHLY,
  },
  {
    asOfDate: '2026-06-30', asset: 'btc', instrumentType: 'fund_units',
    quantity: 889_367, basis: 'look_through',
    lookThroughBtcEquivalent: 194.85,
    isRelatedPartyVehicle: true,          // units in its own fund
    includesCustomerAssets: false,
    provenance: KDM_MONTHLY,
  },
  {
    asOfDate: '2026-06-30', asset: 'sol', instrumentType: 'spot',
    quantity: 41_200, basis: 'direct_spot',
    lookThroughBtcEquivalent: null,
    isRelatedPartyVehicle: false, includesCustomerAssets: false,
    provenance: KDM_MONTHLY,
  },
];

// ---------------------------------------------------------------------------
// 3. Nyala — US issuer, ASX quoted via CDI foreign exempt. Customer assets sit
//    alongside corporate treasury. Excluded from the regional register.
// ---------------------------------------------------------------------------

const NYA_10Q: Provenance = {
  documentId: 'doc-nya-10q-q2',
  documentTitle: 'Form 10-Q, quarter ended 30 June 2026',
  sourceClass: 'audited_accounts',
  sourceUrl: '/fixtures/docs/nya-10q.pdf',
  publishedAt: '2026-07-30',
  isAudited: true,
};

export const nyalaPayments: ResearchCompany = {
  id: 'cmp-nya',
  slug: 'demo-nyala-payments',
  legalName: 'Nyala Payments Inc.',
  formerNames: [{ name: 'Nyala Commerce Inc.', usedTo: '2022-01-11' }],
  listings: [
    { venue: 'nyse', ticker: 'NYLA', listingType: 'primary',
      filingEntity: 'Nyala Payments Inc.', listedFrom: '2016-11-18', listedTo: null },
    { venue: 'asx', ticker: 'NYLA', listingType: 'cdi_foreign_exempt',
      filingEntity: 'Nyala Payments Inc.', listedFrom: '2023-02-06', listedTo: null },
  ],
  jurisdiction: 'US',
  primaryArchetype: 'operational_integration',
  selfDescribedArchetype: null,
  reportingStandard: 'us_gaap',
  functionalCurrency: 'USD',
  presentationCurrency: 'USD',
  tier: 'bellwether',   // NOT regional, despite the ASX quotation
  expectedDisclosureCadence: 'quarterly',
  curatorNotes:
    'ASX quoted via CDI foreign exempt listing and therefore outside most of the ' +
    'exchange listing rules. Belongs in bellwether, never in the regional register. ' +
    'Headline holdings include assets custodied for customers.',
  lastVerifiedAt: '2026-08-12',
  isFixture: true,
};

export const nyalaHoldings: HoldingRow[] = [
  {
    asOfDate: '2026-06-30', asset: 'btc', instrumentType: 'spot',
    quantity: 8_997.89, basis: 'direct_spot',
    lookThroughBtcEquivalent: null,
    isRelatedPartyVehicle: false, includesCustomerAssets: false,
    provenance: NYA_10Q,
  },
  {
    asOfDate: '2026-06-30', asset: 'btc', instrumentType: 'other',
    quantity: 28_355.05, basis: 'includes_customer_assets',
    lookThroughBtcEquivalent: null,
    isRelatedPartyVehicle: false, includesCustomerAssets: true,
    provenance: NYA_10Q,
  },
];

// ---------------------------------------------------------------------------
// 4 & 5. Quiet day, and stale-against-cadence. Same silence, different verdict.
// ---------------------------------------------------------------------------

export const tarraHoldings: ResearchCompany = {
  id: 'cmp-tar',
  slug: 'demo-tarra-holdings',
  legalName: 'Tarra Holdings Limited',
  formerNames: [],
  listings: [
    { venue: 'asx', ticker: 'TARH', listingType: 'primary',
      filingEntity: 'Tarra Holdings Limited', listedFrom: '2019-07-01', listedTo: null },
  ],
  jurisdiction: 'AU',
  primaryArchetype: 'treasury_allocation',
  selfDescribedArchetype: null,
  reportingStandard: 'aasb',
  functionalCurrency: 'AUD',
  presentationCurrency: 'AUD',
  tier: 'regional',
  expectedDisclosureCadence: 'episodic',
  curatorNotes:
    'One policy, one acquisition, then nothing for eighteen months. This is the ' +
    'normal state of most of the register and it must render as a legitimate ' +
    'record, not a broken page. Drives the quiet-day path.',
  lastVerifiedAt: '2026-08-12',
  isFixture: true,
};

export const orreyCapital: ResearchCompany = {
  id: 'cmp-orr',
  slug: 'demo-orrey-capital',
  legalName: 'Orrey Capital Limited',
  formerNames: [],
  listings: [
    { venue: 'asx', ticker: 'ORRY', listingType: 'primary',
      filingEntity: 'Orrey Capital Limited', listedFrom: '2020-11-30', listedTo: null },
  ],
  jurisdiction: 'AU',
  primaryArchetype: 'native_exposure',
  selfDescribedArchetype: null,
  reportingStandard: 'aasb',
  functionalCurrency: 'AUD',
  presentationCurrency: 'AUD',
  tier: 'regional',
  expectedDisclosureCadence: 'monthly',
  curatorNotes:
    'Commits to monthly treasury disclosure and has published nothing for ninety ' +
    'days. Identical silence to Tarra, opposite verdict, because staleness is ' +
    'measured against the issuer stated cadence rather than a fixed window.',
  lastVerifiedAt: '2026-05-14',
  isFixture: true,
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const fixtureCompanies: ResearchCompany[] = [
  meridianFreight,
  kestrelDam,
  nyalaPayments,
  tarraHoldings,
  orreyCapital,
];

/**
 * Aggregate helper. Non-comparable bases are excluded rather than summed.
 * Kestrel's fund units and Nyala's customer assets both fall out here, which
 * is the point.
 */
export function aggregateBtc(rows: HoldingRow[]): {
  total: number;
  excluded: HoldingRow[];
} {
  const excluded = rows.filter(
    (r) => r.asset !== 'btc' || !COMPARABLE_BASES.has(r.basis),
  );
  const total = rows
    .filter((r) => r.asset === 'btc' && COMPARABLE_BASES.has(r.basis))
    .reduce((sum, r) => sum + r.quantity, 0);
  return { total, excluded };
}

/** Archetypes that may appear in one comparison. Anything else refuses. */
export function assertComparable(companies: ResearchCompany[]): void {
  const archetypes = new Set(companies.map((c) => c.primaryArchetype));
  if (archetypes.size > 1) {
    throw new Error(
      `Refusing to compare across archetypes: ${[...archetypes].join(', ')}. ` +
        'A funds manager has no treasury policy to lift and no covenant story; ' +
        'rendering it beside an operating business would mislead.',
    );
  }
}
