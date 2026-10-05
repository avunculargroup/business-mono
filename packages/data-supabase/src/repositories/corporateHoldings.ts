import type {
  CompanyDossier,
  CompanyIdentifier,
  CompanyFact,
  CompanyListing,
  CorporateHoldingsRepository,
  FormerName,
  FreshnessRow,
  JurisdictionNote,
  LedgerEntry,
  Paginated,
  PositionRow,
  PositionSummary,
  Provenance,
  QueryOptions,
  ReadContext,
  RegisterEntry,
  RegisterFilter,
  ReviewQueueEntry,
  ReviewReadOptions,
  StructuralAbsence,
  SummaryDraft,
  TrackerClaim,
  WithheldField,
} from '@platform/data';
import { ArchetypeMismatchError, measureTrackerClaim } from '@platform/data';
import type {
  DisclosureCadence,
  HoldingBasis,
  HoldingStatus,
  InstrumentType,
  LedgerAbsenceReason,
  ListingType,
  ReportingStandard,
  ResearchArchetype,
  ResearchClassification,
  ResearchTier,
  ReviewState,
  SourceClass,
  TreasuryEventType,
} from '@platform/shared';
import type { SupabaseAdapterContext } from '../adapterContext';

/**
 * The corporate research register.
 *
 * Every read goes through a view rather than a table. That is not style: the
 * views are where the rules live — `v_research_ledger` computes AUD from a
 * stated FX rate, `v_company_position` resolves the latest snapshot and joins
 * `holding_bases.comparable`, and `v_research_publishable` applies both
 * publication gates. An adapter reading the tables would have to reimplement
 * all three, and would be the second place they could disagree.
 *
 * The corporate holdings tables are absent from the generated `Database` types
 * until `pnpm --filter @platform/db generate-types` runs against the migrated
 * database. The casts are confined to the table constants below and the row
 * types beneath them, exactly as `research.ts` does for `reports`.
 */
const COMPANIES_TABLE = 'research_companies' as never;
const LEDGER_VIEW = 'v_research_ledger' as never;
const PUBLISHABLE_VIEW = 'v_research_publishable' as never;
const POSITION_VIEW = 'v_company_position' as never;
const FRESHNESS_VIEW = 'v_research_freshness' as never;
const ABSENCES_VIEW = 'v_research_absences' as never;
const NOTES_TABLE = 'jurisdiction_notes' as never;
const FACTS_VIEW = 'v_company_facts' as never;
const CLASSIFICATIONS_TABLE = 'research_classifications' as never;
const SECONDARY_CLAIMS_TABLE = 'secondary_claims' as never;
const REVIEW_QUEUE_VIEW = 'v_research_review_queue' as never;

/**
 * The row states a read returns. The views already drop retired rows; this is
 * the line between a reviewed read and a reviewer's one.
 */
function readableStates(opts?: ReviewReadOptions): ReviewState[] {
  return opts?.includeDrafts ? ['internal', 'draft'] : ['internal'];
}

/** The page size the register list uses. The register is under twenty records. */
const LIST_LIMIT = 50;
/** A company's whole ledger fits on its page; nothing has more than a few dozen events. */
const LEDGER_LIMIT = 200;

const COMPANY_COLUMNS =
  'id, slug, legal_name, jurisdiction, tier, primary_archetype, self_described_archetype, ' +
  'reporting_standard, expected_disclosure_cadence, operational_hq, ' +
  'functional_currency, presentation_currency, financial_year_end, market_cap_band, ' +
  'funding_source, curator_notes, last_verified_at, review_state, changed_since_review, client_cleared, client_summary, ' +
  'ledger_absence_reason, holding_status, exited_on, ' +
  'company_listings(venue, ticker, listing_type, filing_entity, listed_from, listed_to), ' +
  'company_former_names(name, used_to), ' +
  'company_identifiers(scheme, value, valid_from, valid_to)';

const LEDGER_COLUMNS =
  'id, company_id, event_type, asset_class, event_date, quantity, consideration_native, ' +
  'native_currency, consideration_aud, fx_rate_used, fees_included, headline, detail, ' +
  'disclosure_venue, basis, basis_comparable, classification, source_document_id, ' +
  'source_title, source_class, source_url, source_published_at, source_is_audited, review_state, ingest_run_id, ' +
  'changed_since_review';

const POSITION_COLUMNS =
  'snapshot_id, company_id, as_of_date, asset, instrument_type, quantity, basis, ' +
  'basis_comparable, look_through_btc_equivalent, is_related_party_vehicle, ' +
  'includes_customer_assets, encumbered_quantity, encumbrance_counterparty, ' +
  'encumbrance_obligation, source_document_id, source_title, source_class, source_url, ' +
  'source_published_at';

const NOTE_COLUMNS =
  'id, note_key, topic, title, body, rule_reference, primary_source_url, ' +
  'applies_to_standard, applies_to_venue, applies_to_listing_type, verified_at, ' +
  'is_published';

type ListingRow = {
  venue: string;
  ticker: string;
  listing_type: ListingType;
  filing_entity: string | null;
  listed_from: string | null;
  listed_to: string | null;
};

type CompanyRow = {
  id: string;
  slug: string;
  legal_name: string;
  jurisdiction: string | null;
  tier: ResearchTier;
  primary_archetype: ResearchArchetype;
  self_described_archetype: ResearchArchetype | null;
  reporting_standard: ReportingStandard | null;
  expected_disclosure_cadence: DisclosureCadence;
  operational_hq: string | null;
  functional_currency: string | null;
  presentation_currency: string | null;
  financial_year_end: string | null;
  market_cap_band: string | null;
  funding_source: string | null;
  curator_notes: string | null;
  last_verified_at: string | null;
  review_state: ReviewState;
  changed_since_review: boolean;
  client_cleared: boolean;
  client_summary: string | null;
  ledger_absence_reason: LedgerAbsenceReason | null;
  holding_status: HoldingStatus | null;
  exited_on: string | null;
  company_listings: ListingRow[] | null;
  company_former_names: { name: string; used_to: string | null }[] | null;
  company_identifiers: IdentifierRow[] | null;
};

type IdentifierRow = {
  scheme: string;
  value: string;
  valid_from: string | null;
  valid_to: string | null;
};

type LedgerRow = {
  id: string;
  company_id: string;
  event_type: TreasuryEventType;
  asset_class: string;
  event_date: string;
  quantity: number | null;
  consideration_native: number | null;
  native_currency: string | null;
  consideration_aud: number | null;
  fx_rate_used: number | null;
  fees_included: boolean | null;
  headline: string;
  detail: string | null;
  disclosure_venue: string | null;
  basis: HoldingBasis | null;
  basis_comparable: boolean | null;
  classification: ResearchClassification;
  review_state: ReviewState;
  changed_since_review: boolean;
  ingest_run_id: string | null;
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
  source_is_audited: boolean;
};

type PositionViewRow = {
  snapshot_id: string;
  company_id: string;
  as_of_date: string;
  asset: string;
  instrument_type: InstrumentType;
  quantity: number;
  basis: HoldingBasis;
  basis_comparable: boolean;
  look_through_btc_equivalent: number | null;
  is_related_party_vehicle: boolean;
  includes_customer_assets: boolean;
  encumbered_quantity: number | null;
  encumbrance_counterparty: string | null;
  encumbrance_obligation: string | null;
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
};

type SecondaryClaimRow = {
  source_name: string;
  source_url: string | null;
  claimed_quantity: number | null;
  claimed_as_of: string | null;
  observed_at: string;
  note: string | null;
};

type FreshnessViewRow = {
  id: string;
  slug: string;
  expected_disclosure_cadence: DisclosureCadence;
  latest_document_at: string | null;
  days_since_document: number | null;
  stale_after_days: number;
  is_stale: boolean;
};

type ReviewQueueRow = {
  company_id: string;
  slug: string;
  legal_name: string;
  tier: ResearchTier;
  company_review_state: ReviewState;
  draft_events: number | string;
  draft_findings: number | string;
  draft_facts: number | string;
  company_changed_since_review: boolean;
  changed_events: number | string;
  changed_findings: number | string;
  changed_facts: number | string;
};

type AbsenceRow = {
  company_id: string;
  review_state: ReviewState;
  changed_since_review: boolean;
  ingest_run_id: string | null;
  subject: StructuralAbsence['subject'];
  headline: string;
  detail: string | null;
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
  source_is_audited: boolean;
};

type FactRow = {
  id: string;
  review_state: ReviewState;
  changed_since_review: boolean;
  field_key: string;
  label: string;
  value: string;
  as_of: string | null;
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
  source_is_audited: boolean;
  conflicting_value: string | null;
  conflicting_source_title: string | null;
  conflicting_source_class: SourceClass | null;
  conflicting_source_url: string | null;
};

type NoteRow = {
  id: string;
  note_key: string;
  topic: JurisdictionNote['topic'];
  title: string;
  body: string;
  rule_reference: string | null;
  primary_source_url: string | null;
  applies_to_standard: ReportingStandard | null;
  applies_to_venue: string | null;
  applies_to_listing_type: ListingType | null;
  verified_at: string | null;
  is_published: boolean;
};

function toListing(row: ListingRow): CompanyListing {
  return {
    venue: row.venue,
    ticker: row.ticker,
    listingType: row.listing_type,
    filingEntity: row.filing_entity,
    listedFrom: row.listed_from,
    listedTo: row.listed_to,
  };
}

function toIdentifier(row: IdentifierRow): CompanyIdentifier {
  return { scheme: row.scheme, value: row.value, validFrom: row.valid_from, validTo: row.valid_to };
}

function toFormerName(row: { name: string; used_to: string | null }): FormerName {
  return { name: row.name, usedTo: row.used_to };
}

function toDossier(row: CompanyRow): CompanyDossier {
  const listings = (row.company_listings ?? []).map(toListing);

  return {
    id: row.id,
    slug: row.slug,
    legalName: row.legal_name,
    jurisdiction: row.jurisdiction,
    tier: row.tier,
    primaryArchetype: row.primary_archetype,
    selfDescribedArchetype: row.self_described_archetype,
    reportingStandard: row.reporting_standard,
    expectedDisclosureCadence: row.expected_disclosure_cadence,
    // `listings` is where the company trades now; `listingHistory` keeps the
    // venue it left, which is where half its filings still are.
    listings: listings.filter((listing) => listing.listedTo === null),
    listingHistory: listings,
    formerNames: (row.company_former_names ?? []).map(toFormerName),
    identifiers: (row.company_identifiers ?? []).map(toIdentifier),
    operationalHq: row.operational_hq,
    functionalCurrency: row.functional_currency,
    presentationCurrency: row.presentation_currency,
    financialYearEnd: row.financial_year_end,
    marketCapBand: row.market_cap_band,
    fundingSource: row.funding_source,
    curatorNotes: row.curator_notes,
    lastVerifiedAt: row.last_verified_at,
    reviewState: row.review_state,
    changedSinceReview: row.changed_since_review,
    clientCleared: row.client_cleared,
    clientSummary: row.client_summary,
    ledgerAbsenceReason: row.ledger_absence_reason,
    holdingStatus: row.holding_status,
    exitedOn: row.exited_on,
  };
}

function toRegisterEntry(company: CompanyDossier): RegisterEntry {
  return {
    id: company.id,
    slug: company.slug,
    legalName: company.legalName,
    jurisdiction: company.jurisdiction,
    tier: company.tier,
    primaryArchetype: company.primaryArchetype,
    selfDescribedArchetype: company.selfDescribedArchetype,
    reportingStandard: company.reportingStandard,
    expectedDisclosureCadence: company.expectedDisclosureCadence,
    listings: company.listings,
    reviewState: company.reviewState,
  };
}

function toProvenance(row: {
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
  source_is_audited?: boolean;
}): Provenance {
  return {
    documentId: row.source_document_id,
    documentTitle: row.source_title,
    sourceClass: row.source_class,
    sourceUrl: row.source_url,
    publishedAt: row.source_published_at,
    isAudited: row.source_is_audited ?? false,
  };
}

function toLedgerEntry(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    companyId: row.company_id,
    eventType: row.event_type,
    assetClass: row.asset_class,
    eventDate: row.event_date,
    quantity: row.quantity,
    considerationNative: row.consideration_native,
    nativeCurrency: row.native_currency,
    considerationAud: row.consideration_aud,
    fxRateUsed: row.fx_rate_used,
    feesIncluded: row.fees_included,
    headline: row.headline,
    detail: row.detail,
    disclosureVenue: row.disclosure_venue,
    basis: row.basis,
    basisComparable: row.basis_comparable,
    classification: row.classification,
    reviewState: row.review_state,
    changedSinceReview: row.changed_since_review,
    ingestRunId: row.ingest_run_id,
    provenance: toProvenance(row),
  };
}

function toPositionRow(row: PositionViewRow): PositionRow {
  return {
    id: row.snapshot_id,
    asOfDate: row.as_of_date,
    asset: row.asset,
    instrumentType: row.instrument_type,
    quantity: row.quantity,
    basis: row.basis,
    basisComparable: row.basis_comparable,
    lookThroughBtcEquivalent: row.look_through_btc_equivalent,
    isRelatedPartyVehicle: row.is_related_party_vehicle,
    includesCustomerAssets: row.includes_customer_assets,
    encumberedQuantity: row.encumbered_quantity,
    encumbranceCounterparty: row.encumbrance_counterparty,
    encumbranceObligation: row.encumbrance_obligation,
    provenance: toProvenance(row),
  };
}

function toNote(row: NoteRow): JurisdictionNote {
  return {
    id: row.id,
    noteKey: row.note_key,
    topic: row.topic,
    title: row.title,
    body: row.body,
    ruleReference: row.rule_reference,
    primarySourceUrl: row.primary_source_url,
    appliesToStandard: row.applies_to_standard,
    appliesToVenue: row.applies_to_venue,
    appliesToListingType: row.applies_to_listing_type,
    verifiedAt: row.verified_at,
    isPublished: row.is_published,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createCorporateHoldingsRepository(
  adapter: SupabaseAdapterContext,
): CorporateHoldingsRepository {
  const { client } = adapter;

  /** By UUID or slug, because the register links by slug and joins by id. */
  async function loadCompany(idOrSlug: string): Promise<CompanyDossier | null> {
    const { data, error } = await client
      .from(COMPANIES_TABLE)
      .select(COMPANY_COLUMNS)
      .eq(UUID.test(idOrSlug) ? 'id' : 'slug', idOrSlug)
      .maybeSingle();

    if (error) throw error;
    return data ? toDossier(data as unknown as CompanyRow) : null;
  }

  async function loadPosition(companyId: string): Promise<PositionSummary> {
    const { data, error } = await client
      .from(POSITION_VIEW)
      .select(POSITION_COLUMNS)
      .eq('company_id', companyId)
      .order('as_of_date', { ascending: false });

    if (error) throw error;

    const rows = ((data ?? []) as unknown as PositionViewRow[]).map(toPositionRow);
    const asset = 'btc';
    const inAsset = rows.filter((row) => row.asset === asset);
    const comparable = inAsset.filter((row) => row.basisComparable);
    const comparableTotal = comparable.reduce((sum, row) => sum + row.quantity, 0);

    // The aggregate is decided here rather than by the caller. Handing back
    // rows and trusting three components to filter them the same way is how
    // a look-through position ends up inside a total.
    return {
      companyId,
      asset,
      comparableTotal,
      unencumberedTotal:
        comparableTotal - comparable.reduce((sum, row) => sum + (row.encumberedQuantity ?? 0), 0),
      rows,
      excluded: inAsset.filter((row) => !row.basisComparable),
    };
  }

  return {
    async listCompanies(
      _ctx: ReadContext,
      filter?: RegisterFilter,
      opts?: QueryOptions,
    ): Promise<Paginated<RegisterEntry>> {
      const limit = opts?.limit ?? LIST_LIMIT;
      const offset = opts?.offset ?? 0;

      let query = client
        .from(COMPANIES_TABLE)
        .select(COMPANY_COLUMNS, { count: 'exact' })
        .order('legal_name');

      // Pushed down rather than filtered after the fetch: a register filtered
      // in the page is a register that pages wrongly.
      if (filter?.tier) query = query.eq('tier', filter.tier);
      if (filter?.archetype) query = query.eq('primary_archetype', filter.archetype);
      if (filter?.jurisdiction) query = query.eq('jurisdiction', filter.jurisdiction);
      query = query.eq('review_state', filter?.reviewState ?? 'internal');

      const { data, count, error } = await query.range(offset, offset + limit - 1);
      if (error) throw error;

      const items = ((data ?? []) as unknown as CompanyRow[])
        .map(toDossier)
        .map(toRegisterEntry);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async getCompany(_ctx: ReadContext, slug: string): Promise<CompanyDossier | null> {
      return loadCompany(slug);
    },

    async getLedger(
      _ctx: ReadContext,
      companyId: string,
      opts?: { publishableOnly?: boolean } & ReviewReadOptions & QueryOptions,
    ): Promise<Paginated<LedgerEntry>> {
      const limit = opts?.limit ?? LEDGER_LIMIT;
      const offset = opts?.offset ?? 0;

      // A different view, not a filter over the same rows. The publishable
      // view applies both gates in the database, so a client-facing surface
      // cannot receive an internal row and then decline to render it.
      const view = opts?.publishableOnly ? PUBLISHABLE_VIEW : LEDGER_VIEW;

      const { data, count, error } = await client
        .from(view)
        .select(LEDGER_COLUMNS, { count: 'exact' })
        .eq('company_id', companyId)
        // The publishable view already requires a reviewed row; a draft never
        // reaches it whatever is asked.
        .in('review_state', opts?.publishableOnly ? ['internal'] : readableStates(opts))
        .order('event_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = ((data ?? []) as unknown as LedgerRow[]).map(toLedgerEntry);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    getPosition: (_ctx: ReadContext, companyId: string) => loadPosition(companyId),

    async getJurisdictionNotes(
      _ctx: ReadContext,
      keys: {
        standard?: ReportingStandard;
        venue?: string;
        listingType?: ListingType;
      },
    ): Promise<JurisdictionNote[]> {
      // A note applies where each dimension it names matches, and a dimension
      // it leaves null applies to every value. Expressed as one `or` per
      // dimension so the whole match happens in Postgres.
      let query = client.from(NOTES_TABLE).select(NOTE_COLUMNS).order('title');

      query = keys.standard
        ? query.or(`applies_to_standard.is.null,applies_to_standard.eq.${keys.standard}`)
        : query.is('applies_to_standard', null);
      query = keys.venue
        ? query.or(`applies_to_venue.is.null,applies_to_venue.eq.${keys.venue}`)
        : query.is('applies_to_venue', null);
      query = keys.listingType
        ? query.or(`applies_to_listing_type.is.null,applies_to_listing_type.eq.${keys.listingType}`)
        : query.is('applies_to_listing_type', null);

      const { data, error } = await query;
      if (error) throw error;

      // A note naming nothing at all matches every query and belongs on no
      // panel; the fixture adapter drops it too.
      return ((data ?? []) as unknown as NoteRow[])
        .filter(
          (row) =>
            row.applies_to_standard !== null ||
            row.applies_to_venue !== null ||
            row.applies_to_listing_type !== null,
        )
        .map(toNote);
    },

    async getFreshness(_ctx: ReadContext, companyId: string): Promise<FreshnessRow> {
      const { data, error } = await client
        .from(FRESHNESS_VIEW)
        .select(
          'id, slug, expected_disclosure_cadence, latest_document_at, days_since_document, stale_after_days, is_stale',
        )
        .eq('id', companyId)
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error(`no research company ${companyId}`);

      const row = data as unknown as FreshnessViewRow;
      return {
        companyId: row.id,
        slug: row.slug,
        expectedDisclosureCadence: row.expected_disclosure_cadence,
        latestDocumentAt: row.latest_document_at,
        daysSinceDocument: row.days_since_document,
        staleAfterDays: row.stale_after_days,
        isStale: row.is_stale,
      };
    },

    async getCompanyFacts(
      _ctx: ReadContext,
      companyId: string,
      opts?: ReviewReadOptions,
    ): Promise<CompanyFact[]> {
      // The view has already resolved which document wins and attached the
      // claim that lost, so the adapter maps rather than ranks. Ranking here
      // would put the source hierarchy in two places.
      const { data, error } = await client
        .from(FACTS_VIEW)
        .select(
          'id, field_key, label, value, as_of, source_document_id, source_title, source_class, source_url, source_published_at, source_is_audited, conflicting_value, conflicting_source_title, conflicting_source_class, conflicting_source_url, review_state, changed_since_review',
        )
        .eq('company_id', companyId)
        .in('review_state', readableStates(opts))
        .order('field_key');

      if (error) throw error;

      return ((data ?? []) as unknown as FactRow[]).map((row) => ({
        id: row.id,
        fieldKey: row.field_key,
        label: row.label,
        value: row.value,
        asOf: row.as_of,
        reviewState: row.review_state,
        changedSinceReview: row.changed_since_review,
        provenance: toProvenance(row),
        conflicting:
          row.conflicting_value === null
            ? null
            : {
                value: row.conflicting_value,
                provenance: {
                  documentTitle: row.conflicting_source_title ?? '',
                  sourceClass: row.conflicting_source_class ?? 'secondary',
                  sourceUrl: row.conflicting_source_url,
                },
              },
      }));
    },

    async getWithheldFields(_ctx: ReadContext, companyId: string): Promise<WithheldField[]> {
      // Company-scoped classifications only. The per-event ones gate the ledger
      // rows themselves and are already applied by the publishable view; these
      // are the categories of claim the page declines to make at all.
      const { data, error } = await client
        .from(CLASSIFICATIONS_TABLE)
        .select('field_key, classification, reason')
        .eq('subject_table', 'research_companies')
        .eq('subject_id', companyId)
        .in('classification', ['internal', 'restricted'])
        .order('field_key');

      if (error) throw error;

      return ((data ?? []) as unknown as Array<{
        field_key: string;
        classification: 'internal' | 'restricted';
        reason: string;
      }>).map((row) => ({
        fieldKey: row.field_key,
        classification: row.classification,
        reason: row.reason,
      }));
    },

    async getStructuralAbsences(
      _ctx: ReadContext,
      companyId: string,
      opts?: ReviewReadOptions,
    ): Promise<StructuralAbsence[]> {
      const { data, error } = await client
        .from(ABSENCES_VIEW)
        .select(
          'company_id, subject, headline, detail, source_document_id, source_title, source_class, source_url, source_published_at, source_is_audited, review_state, ingest_run_id, changed_since_review',
        )
        .eq('company_id', companyId)
        .in('review_state', readableStates(opts));

      if (error) throw error;

      return ((data ?? []) as unknown as AbsenceRow[]).map((row) => ({
        companyId: row.company_id,
        subject: row.subject,
        // The detail carries the citation; the headline is the panel's label.
        statement: row.detail ?? row.headline,
        reviewState: row.review_state,
        changedSinceReview: row.changed_since_review,
        ingestRunId: row.ingest_run_id,
        provenance: toProvenance(row),
      }));
    },

    async getReviewQueue(_ctx: ReadContext): Promise<ReviewQueueEntry[]> {
      const { data, error } = await client
        .from(REVIEW_QUEUE_VIEW)
        .select(
          'company_id, slug, legal_name, tier, company_review_state, draft_events, draft_findings, draft_facts, ' +
            'company_changed_since_review, changed_events, changed_findings, changed_facts',
        )
        .order('legal_name');

      if (error) throw error;

      return ((data ?? []) as unknown as ReviewQueueRow[]).map((row) => ({
        companyId: row.company_id,
        slug: row.slug,
        legalName: row.legal_name,
        tier: row.tier,
        companyReviewState: row.company_review_state,
        draftEvents: Number(row.draft_events),
        draftFindings: Number(row.draft_findings),
        draftFacts: Number(row.draft_facts),
        companyChangedSinceReview: row.company_changed_since_review,
        changedEvents: Number(row.changed_events),
        changedFindings: Number(row.changed_findings),
        changedFacts: Number(row.changed_facts),
      }));
    },

    async getTrackerClaims(_ctx: ReadContext, companyId: string): Promise<TrackerClaim[]> {
      const { data, error } = await client
        .from(SECONDARY_CLAIMS_TABLE)
        .select('source_name, source_url, claimed_quantity, claimed_as_of, observed_at, note')
        .eq('company_id', companyId)
        .order('observed_at', { ascending: false });

      if (error) throw error;

      const rows = (data ?? []) as unknown as SecondaryClaimRow[];
      if (rows.length === 0) return [];

      // Measured against the comparable total only. A tracker's figure set
      // beside a look-through or customer-asset number would be compared with
      // something the register itself refuses to aggregate.
      const position = await loadPosition(companyId);
      const comparable = position.rows.filter(
        (row) => row.basisComparable && row.asset === position.asset,
      );
      const sourced =
        comparable.length === 0
          ? null
          : { quantity: position.comparableTotal, asOf: comparable[0].asOfDate };

      return rows.map((row) =>
        measureTrackerClaim(
          {
            sourceName: row.source_name,
            sourceUrl: row.source_url,
            claimedQuantity: row.claimed_quantity,
            claimedAsOf: row.claimed_as_of,
            observedAt: row.observed_at,
            note: row.note,
          },
          sourced,
        ),
      );
    },

    async getSummaryDraft(_ctx: ReadContext, companyId: string): Promise<SummaryDraft | null> {
      const { data, error } = await client
        .from('research_summary_drafts')
        .select('company_id, body, drafted_at, ingest_run_id')
        .eq('company_id', companyId)
        .maybeSingle();

      if (error) throw error;
      const row = data as unknown as {
        company_id: string;
        body: string;
        drafted_at: string;
        ingest_run_id: string | null;
      } | null;
      if (!row) return null;

      return {
        companyId: row.company_id,
        body: row.body,
        draftedAt: row.drafted_at,
        ingestRunId: row.ingest_run_id,
      };
    },

    async compareCompanies(_ctx: ReadContext, slugs: string[]): Promise<CompanyDossier[]> {
      const loaded = await Promise.all(slugs.map(loadCompany));
      const found = loaded.filter((row): row is CompanyDossier => row !== null);

      const archetypes = [...new Set(found.map((row) => row.primaryArchetype))];
      if (archetypes.length > 1) {
        throw new ArchetypeMismatchError(archetypes);
      }

      return found;
    },
  };
}
