// Corporate Holdings — the vocabulary of the corporate research register.
// Spec: docs/features/corporate-holdings/corporate-research-spec.md
//
// These mirror CHECK constraints in 20260904000000_add_corporate_holdings.sql
// and are declared once here so the ingest workflow, the repositories and the
// pages all spell them the same way.
//
// Two vocabularies are deliberately NOT here. `holding_bases` and
// `source_classes` are lookup TABLES rather than CHECKs, because adding a value
// has to be an INSERT: three research records produced four bases, each found
// empirically, and the aggregate rule reads `comparable` off the row rather
// than off a list in code. The unions below are the values seeded today — a
// fifth basis is expected, and the type is a convenience for the seeded set,
// never the authority on it.

// ── Archetype ──────────────────────────────────────────────────────────────

// Gates the comparison UI, not just the label. A funds manager has no treasury
// policy to lift, no board approval path worth studying and no covenant story,
// so a table putting one beside an operating business misleads by construction.
export const ResearchArchetype = {
  TREASURY_ALLOCATION:     'treasury_allocation',
  TREASURY_COMPANY:        'treasury_company',
  NATIVE_EXPOSURE:         'native_exposure',
  OPERATIONAL_INTEGRATION: 'operational_integration',
} as const;
export type ResearchArchetype = (typeof ResearchArchetype)[keyof typeof ResearchArchetype];

// ── Tier ───────────────────────────────────────────────────────────────────

// Unequal in depth and non-comparable in the UI. `regional` is the credibility
// anchor and is seeded by hand; automation earns its keep on changes, not on
// discovery.
export const ResearchTier = {
  REGIONAL:     'regional',
  PEER_SHAPED:  'peer_shaped',
  BELLWETHER:   'bellwether',
} as const;
export type ResearchTier = (typeof ResearchTier)[keyof typeof ResearchTier];

// ── Listing ────────────────────────────────────────────────────────────────

// Gates regional-register membership rather than annotating it: a foreign
// exempt CDI quotation is exempt from most listing rules, including the
// cash-box test that is the whole reason a domestic entity's venue matters.
export const ListingType = {
  PRIMARY:            'primary',
  SECONDARY:          'secondary',
  CDI_FOREIGN_EXEMPT: 'cdi_foreign_exempt',
} as const;
export type ListingType = (typeof ListingType)[keyof typeof ListingType];

// ── Reporting ──────────────────────────────────────────────────────────────

export const ReportingStandard = {
  AASB:    'aasb',
  NZ_IFRS: 'nz_ifrs',
  US_GAAP: 'us_gaap',
  SFRS:    'sfrs',
  IFRS:    'ifrs',
  JGAAP:   'jgaap',
  OTHER:   'other',
} as const;
export type ReportingStandard = (typeof ReportingStandard)[keyof typeof ReportingStandard];

// What "overdue" means for this issuer. Staleness is measured against the
// issuer's own commitment, so ninety days of silence is unremarkable for an
// episodic discloser and overdue for one that promised monthly reporting.
export const DisclosureCadence = {
  MONTHLY:   'monthly',
  QUARTERLY: 'quarterly',
  EPISODIC:  'episodic',
} as const;
export type DisclosureCadence = (typeof DisclosureCadence)[keyof typeof DisclosureCadence];

// Days of silence before a record is stale, by cadence. Mirrors the CASE in
// v_research_freshness; the fixture adapter computes freshness from these
// rather than storing an is_stale literal it would have to keep true.
export const STALE_AFTER_DAYS: Record<DisclosureCadence, number> = {
  monthly:   45,
  quarterly: 135,
  episodic:  240,
};

// ── Ledger ─────────────────────────────────────────────────────────────────

// `covenant_change` and `capital_posture_change` are the two that no existing
// tracker sees: a secured lender rewriting a liquidity covenant to admit
// bitcoin, and an issuance facility sitting idle through a quarter while a
// buyback runs. Both are only visible by joining two documents.
export const TreasuryEventType = {
  POLICY_ADOPTION:         'policy_adoption',
  ACQUISITION:             'acquisition',
  DISPOSAL:                'disposal',
  CAPITAL_RAISE:           'capital_raise',
  COVENANT_CHANGE:         'covenant_change',
  CAPITAL_POSTURE_CHANGE:  'capital_posture_change',
  CUSTODY_CHANGE:          'custody_change',
  LISTING_CHANGE:          'listing_change',
  ACCOUNTING_ELECTION:     'accounting_election',
} as const;
export type TreasuryEventType = (typeof TreasuryEventType)[keyof typeof TreasuryEventType];

export const InstrumentType = {
  SPOT:            'spot',
  FUND_UNITS:      'fund_units',
  SPC_INVESTMENT:  'spc_investment',
  TOKENISED_FUND:  'tokenised_fund',
  OTHER:           'other',
} as const;
export type InstrumentType = (typeof InstrumentType)[keyof typeof InstrumentType];

// ── Sources and bases (lookup tables, typed for the seeded set) ─────────────

// In `source_classes.rank` order, which is display order only. The ingest
// gate checks membership in each field's set in `field_source_classes`, not
// a rank — custody accepts filed narrative where the ledger does not.
export const SOURCE_CLASS_CODES = [
  'regulated_disclosure',
  'exchange_announcement',
  'audited_accounts',
  'filed_financials',
  'filed_narrative',
  'furnished_release',
  'company_web',
  'secondary',
] as const;
export type SourceClass = (typeof SOURCE_CLASS_CODES)[number];

export const HOLDING_BASIS_CODES = [
  'direct_spot',
  'look_through',
  'includes_customer_assets',
  'stated_unreconciled',
  'etf_wrapped',
] as const;
export type HoldingBasis = (typeof HOLDING_BASIS_CODES)[number];

// ── Classification ─────────────────────────────────────────────────────────

// Lex classifies per field, never per record. Absence of a classification
// means `internal`: a field nobody has reviewed must never default to
// publishable.
export const ResearchClassification = {
  PUBLISHABLE: 'publishable',
  INTERNAL:    'internal',
  RESTRICTED:  'restricted',
} as const;
export type ResearchClassification =
  (typeof ResearchClassification)[keyof typeof ResearchClassification];

// ── Findings ───────────────────────────────────────────────────────────────

export const ResearchFindingType = {
  HOLDINGS_CHANGE:        'holdings_change',
  POLICY_CHANGE:          'policy_change',
  COVENANT_CHANGE:        'covenant_change',
  CAPITAL_POSTURE_CHANGE: 'capital_posture_change',
  CUSTODY_CHANGE:         'custody_change',
  LISTING_CHANGE:         'listing_change',
  ACCOUNTING_ELECTION:    'accounting_election',
  STRUCTURAL_ABSENCE:     'structural_absence',
  // A tracker's figure disagrees with the latest sourced snapshot by more
  // than the materiality floor. The divergence is the finding; the tracker
  // figure is never a source.
  TRACKER_DIVERGENCE:     'tracker_divergence',
} as const;
export type ResearchFindingType =
  (typeof ResearchFindingType)[keyof typeof ResearchFindingType];

// ── Identity, holdings and absence (20261001100000–20261001100200) ─────────

// How a jurisdiction was established. `unknown` is the only basis allowed
// beside a NULL jurisdiction: a sentinel in a country column gets read as a
// country.
export const JurisdictionBasis = {
  STATED_IN_FILING:      'stated_in_filing',
  INFERRED_FROM_LISTING: 'inferred_from_listing',
  UNKNOWN:               'unknown',
} as const;
export type JurisdictionBasis = (typeof JurisdictionBasis)[keyof typeof JurisdictionBasis];

// What a listing line is, beside `listingType`'s where and how it is quoted.
export const SecurityClass = {
  COMMON:              'common',
  PREFERRED:           'preferred',
  DEPOSITARY_INTEREST: 'depositary_interest',
  CDI:                 'cdi',
  OTHER:               'other',
} as const;
export type SecurityClass = (typeof SecurityClass)[keyof typeof SecurityClass];

export const FiscalCalendarType = {
  CALENDAR_DATE:    'calendar_date',
  WEEK_BASED_52_53: 'week_based_52_53',
} as const;
export type FiscalCalendarType = (typeof FiscalCalendarType)[keyof typeof FiscalCalendarType];

// Whether a stated aggregate cost includes fees. Two conventions are two
// measurements, and ranking across them compares unlike things.
export const CostBasisConvention = {
  INCLUSIVE_OF_FEES: 'inclusive_of_fees',
  NET_OF_FEES:       'net_of_fees',
  UNSTATED:          'unstated',
} as const;
export type CostBasisConvention = (typeof CostBasisConvention)[keyof typeof CostBasisConvention];

// A zero snapshot with `exited` is a different statement from a zero with
// `active`, and both differ from no snapshot at all.
export const HoldingStatus = {
  ACTIVE:     'active',
  EXITED:     'exited',
  NEVER_HELD: 'never_held',
} as const;
export type HoldingStatus = (typeof HoldingStatus)[keyof typeof HoldingStatus];

// Where a register record stands. `draft` is where an agent-created record
// lands, unread; a human moves it to `internal`; only an `internal` record can
// be cleared for subscribers. Replaces `is_published`, which read as outward
// and meant inward.
export const ReviewState = {
  DRAFT:    'draft',
  INTERNAL: 'internal',
  RETIRED:  'retired',
} as const;
export type ReviewState = (typeof ReviewState)[keyof typeof ReviewState];

// Why a record has no ledger. Also a work queue: `primary_not_located` is
// research, `filing_system_unreachable` is engineering.
export const LedgerAbsenceReason = {
  NO_STATED_BASIS:           'no_stated_basis',
  SOURCE_CLASS_REFUSED:      'source_class_refused',
  PRIMARY_NOT_LOCATED:       'primary_not_located',
  FILING_SYSTEM_UNREACHABLE: 'filing_system_unreachable',
  NO_HOLDING:                'no_holding',
} as const;
export type LedgerAbsenceReason = (typeof LedgerAbsenceReason)[keyof typeof LedgerAbsenceReason];

export const DocumentResolutionStatus = {
  RESOLVED:     'resolved',
  NO_URL:       'no_url',
  UNFETCHABLE:  'unfetchable',
  FETCH_FAILED: 'fetch_failed',
} as const;
export type DocumentResolutionStatus =
  (typeof DocumentResolutionStatus)[keyof typeof DocumentResolutionStatus];

// Reconciliation deltas below this fraction of the reference quantity are
// logged and suppressed. Calibrated against a restatement of shares on issue
// by 0.03%, caused by buyback shares not yet cancelled — administrative, and
// the kind of noise that trains a reader to ignore the feed.
export const MATERIALITY_FLOOR = 0.005;
