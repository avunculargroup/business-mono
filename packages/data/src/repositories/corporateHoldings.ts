import type {
  DisclosureCadence,
  HoldingBasis,
  InstrumentType,
  ListingType,
  ReportingStandard,
  ResearchArchetype,
  ResearchClassification,
  ResearchTier,
  SourceClass,
  TreasuryEventType,
} from '@platform/shared';
import type { Paginated, QueryOptions, ReadContext } from '../context';

/**
 * The corporate research register: companies holding bitcoin on their balance
 * sheet, read for an Australian CFO deciding whether and how to do the same.
 *
 * Named `corporateHoldings` rather than `research` because `ResearchRepository`
 * is already taken by the news feed. The spec calls this one
 * `ResearchRepository`; the two domains are unrelated and the collision is the
 * only place this implementation departs from the interface it specifies.
 *
 * The distinguishing rule of this domain is that provenance is a required
 * field, not an optional one. A read model that permits a fact without a source
 * permits the bug the feature exists to prevent, so `Provenance` is a
 * non-nullable member of every fact-bearing type below.
 */

/**
 * Where a fact came from, carried on the fact rather than beside it.
 *
 * `sourceClass` is here for the same reason `basis` is on a holding: the
 * reader has to be able to see that a custody claim came from an offer
 * document and not from an About page. One record's marketing copy stated
 * self-custody with no counterparty risk while its own offer document named a
 * third-party custodian and listed custodian insolvency as a key risk.
 */
export interface Provenance {
  documentId: string;
  documentTitle: string;
  sourceClass: SourceClass;
  /** The document itself. Null only where the register holds a filing it could not fetch. */
  sourceUrl: string | null;
  publishedAt: string | null;
  isAudited: boolean;
}

/** A venue the company is or was quoted on. Never a key — a lookup path. */
export interface CompanyListing {
  venue: string;
  ticker: string;
  listingType: ListingType;
  filingEntity: string | null;
  listedFrom: string | null;
  /** Null means current. */
  listedTo: string | null;
}

/** A name the company filed under before. The reason ingest is not name-keyed. */
export interface FormerName {
  name: string;
  usedTo: string | null;
}

/** A company as the register lists it. */
export interface RegisterEntry {
  id: string;
  slug: string;
  legalName: string;
  jurisdiction: string;
  tier: ResearchTier;
  primaryArchetype: ResearchArchetype;
  /**
   * What the company calls itself, where that differs. Kept beside
   * `primaryArchetype` rather than reconciled into it: a logistics business
   * presenting as a bitcoin treasury company is not a labelling problem, it is
   * the case study.
   */
  selfDescribedArchetype: ResearchArchetype | null;
  reportingStandard: ReportingStandard | null;
  expectedDisclosureCadence: DisclosureCadence;
  /** Current venues only. The register lists where a company trades today. */
  listings: CompanyListing[];
}

/** A company's own page. */
export interface CompanyDossier extends RegisterEntry {
  acn: string | null;
  abn: string | null;
  arbn: string | null;
  isin: string | null;
  operationalHq: string | null;
  functionalCurrency: string | null;
  /** May differ from the functional currency; a record reported in NZD may transact in AUD. */
  presentationCurrency: string | null;
  financialYearEnd: string | null;
  marketCapBand: string | null;
  fundingSource: string | null;
  /** Why the record exists and which retrieval traps it carries. Internal. */
  curatorNotes: string | null;
  lastVerifiedAt: string | null;
  isPublished: boolean;
  formerNames: FormerName[];
  /** Every venue, including ones it has left. */
  listingHistory: CompanyListing[];
}

/**
 * One disclosed event.
 *
 * `considerationAud` is computed from an FX rate on the event date and is null
 * when no rate exists for that day — a missing rate is a gap to fill, not a
 * number to invent. `fxRateUsed` is non-null exactly when a conversion
 * happened, so a converted figure can always name the rate that made it.
 */
export interface LedgerEntry {
  id: string;
  companyId: string;
  eventType: TreasuryEventType;
  assetClass: string;
  eventDate: string;
  quantity: number | null;
  considerationNative: number | null;
  nativeCurrency: string | null;
  considerationAud: number | null;
  fxRateUsed: number | null;
  /** A stated consideration may or may not include fees. Null means the document did not say. */
  feesIncluded: boolean | null;
  headline: string;
  detail: string | null;
  disclosureVenue: string | null;
  basis: HoldingBasis | null;
  /** Whether this basis may enter an aggregate. Read off the lookup, not inferred. */
  basisComparable: boolean | null;
  classification: ResearchClassification;
  provenance: Provenance;
}

/**
 * One row of the current position.
 *
 * Rows with a non-comparable basis render — flagged — and are excluded from
 * every total. Hiding them would be worse than summing them: the reader would
 * not know the issuer had stated a larger number.
 */
export interface PositionRow {
  id: string;
  asOfDate: string;
  asset: string;
  instrumentType: InstrumentType;
  quantity: number;
  basis: HoldingBasis;
  basisComparable: boolean;
  lookThroughBtcEquivalent: number | null;
  /** Units in a vehicle the issuer itself manages. */
  isRelatedPartyVehicle: boolean;
  /** Assets custodied for third parties, aggregated into a headline figure. */
  includesCustomerAssets: boolean;
  provenance: Provenance;
}

/**
 * The position with its aggregate already decided by the adapter.
 *
 * `comparableTotal` sums only comparable rows and `excluded` names the rest
 * with the reason each fell out. Returning the rows and leaving the caller to
 * total them is how the rule gets broken by the third component that renders
 * a position.
 */
export interface PositionSummary {
  companyId: string;
  asset: string;
  comparableTotal: number;
  rows: PositionRow[];
  excluded: PositionRow[];
}

/**
 * A jurisdiction note. Keyed on standard, venue and listing type, never on
 * company: written once, joined onto every record it applies to.
 */
export interface JurisdictionNote {
  id: string;
  noteKey: string;
  topic: 'accounting' | 'tax' | 'listing_rules' | 'custody_licensing' | 'disclosure';
  title: string;
  /** Markdown. */
  body: string;
  ruleReference: string | null;
  primarySourceUrl: string | null;
  appliesToStandard: ReportingStandard | null;
  appliesToVenue: string | null;
  appliesToListingType: ListingType | null;
  verifiedAt: string | null;
  isPublished: boolean;
}

/**
 * Staleness against the issuer's own cadence.
 *
 * `daysSinceDocument` is null for a company with no fetched document at all,
 * which is a different state from overdue and reads differently on the page.
 */
export interface FreshnessRow {
  companyId: string;
  slug: string;
  expectedDisclosureCadence: DisclosureCadence;
  latestDocumentAt: string | null;
  daysSinceDocument: number | null;
  staleAfterDays: number;
  isStale: boolean;
}

/**
 * A fact the register can state because it is absent.
 *
 * "No financing facilities at quarter end, per Appendix 4C item 7.4" is an
 * answer. An empty covenant panel is not, and a reader cannot tell it apart
 * from a panel nobody filled in.
 */
export interface StructuralAbsence {
  companyId: string;
  subject: 'covenants' | 'debt' | 'holdings' | 'policy';
  statement: string;
  provenance: Provenance;
}

/**
 * One qualitative field — custody, mandate, accounting treatment, covenants —
 * with the document that establishes it and, where two documents disagreed, the
 * claim that lost.
 *
 * `conflicting` is the panel the register exists to be able to draw. A
 * company's marketing page claiming self-custody with no counterparty risk
 * while its offer document names a third-party custodian and lists custodian
 * insolvency as a key risk is not a data-quality problem to resolve out of
 * sight: it is the finding, and the reader has to see both halves of it.
 */
export interface CompanyFact {
  id: string;
  fieldKey: string;
  label: string;
  /** Markdown. */
  value: string;
  asOf: string | null;
  provenance: Provenance;
  /** Non-null only where a weaker source claimed otherwise. */
  conflicting: {
    value: string;
    provenance: Pick<Provenance, 'documentTitle' | 'sourceClass' | 'sourceUrl'>;
  } | null;
}

export interface RegisterFilter {
  tier?: ResearchTier;
  archetype?: ResearchArchetype;
  jurisdiction?: string;
}

/**
 * Thrown when a comparison is requested across archetypes.
 *
 * An error rather than a boolean, because the caller that ignores a boolean
 * renders the table anyway. `packages/ui` catches this and renders the
 * explanatory panel; in development it surfaces.
 */
export class ArchetypeMismatchError extends Error {
  constructor(readonly archetypes: readonly ResearchArchetype[]) {
    super(
      `Refusing to compare across archetypes: ${archetypes.join(', ')}. ` +
        'A funds manager has no treasury policy to lift and no covenant story; ' +
        'rendering it beside an operating business would mislead.',
    );
    this.name = 'ArchetypeMismatchError';
  }
}

export interface CorporateHoldingsRepository {
  listCompanies(
    ctx: ReadContext,
    filter?: RegisterFilter,
    opts?: QueryOptions,
  ): Promise<Paginated<RegisterEntry>>;

  /** By slug — every navigation into a company goes through it. Null when absent. */
  getCompany(ctx: ReadContext, slug: string): Promise<CompanyDossier | null>;

  /**
   * The ledger, newest event first.
   *
   * `publishableOnly` reads the publishable view, which applies both gates:
   * the company is published AND Lex classified the field publishable. It is a
   * different query, not a filter over the same rows, so a client-facing
   * surface cannot accidentally receive an internal row it then declines to
   * render.
   */
  getLedger(
    ctx: ReadContext,
    companyId: string,
    opts?: { publishableOnly?: boolean } & QueryOptions,
  ): Promise<Paginated<LedgerEntry>>;

  /** The current position with the aggregate already decided. */
  getPosition(ctx: ReadContext, companyId: string): Promise<PositionSummary>;

  /**
   * Notes matching any of the supplied keys. Called with a company's own
   * standard, venue and listing type, so the panel is assembled by the adapter
   * rather than by a page that has to know which notes exist.
   */
  getJurisdictionNotes(
    ctx: ReadContext,
    keys: {
      standard?: ReportingStandard;
      venue?: string;
      listingType?: ListingType;
    },
  ): Promise<JurisdictionNote[]>;

  getFreshness(ctx: ReadContext, companyId: string): Promise<FreshnessRow>;

  /**
   * The qualitative panel, superseded claims already resolved.
   *
   * The adapter returns the winning fact with the losing one attached, rather
   * than both as peers — deciding which document wins is the source hierarchy's
   * job, and a page that had to rank source classes itself would be a page that
   * could get it wrong.
   */
  getCompanyFacts(ctx: ReadContext, companyId: string): Promise<CompanyFact[]>;

  /** Facts the register states because they are absent. Empty is a valid answer. */
  getStructuralAbsences(ctx: ReadContext, companyId: string): Promise<StructuralAbsence[]>;

  /**
   * The companies a comparison would render, or `ArchetypeMismatchError`.
   *
   * The refusal lives here rather than in the component because both apps
   * render this comparison and only one of them would have remembered.
   */
  compareCompanies(ctx: ReadContext, slugs: string[]): Promise<CompanyDossier[]>;
}
