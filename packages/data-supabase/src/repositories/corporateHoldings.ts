import type {
  CompanyDossier,
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
  StructuralAbsence,
} from '@platform/data';
import { ArchetypeMismatchError } from '@platform/data';
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

/** The page size the register list uses. The register is under twenty records. */
const LIST_LIMIT = 50;
/** A company's whole ledger fits on its page; nothing has more than a few dozen events. */
const LEDGER_LIMIT = 200;

const COMPANY_COLUMNS =
  'id, slug, legal_name, jurisdiction, tier, primary_archetype, self_described_archetype, ' +
  'reporting_standard, expected_disclosure_cadence, acn, abn, arbn, isin, operational_hq, ' +
  'functional_currency, presentation_currency, financial_year_end, market_cap_band, ' +
  'funding_source, curator_notes, last_verified_at, is_published, ' +
  'company_listings(venue, ticker, listing_type, filing_entity, listed_from, listed_to), ' +
  'company_former_names(name, used_to)';

const LEDGER_COLUMNS =
  'id, company_id, event_type, asset_class, event_date, quantity, consideration_native, ' +
  'native_currency, consideration_aud, fx_rate_used, fees_included, headline, detail, ' +
  'disclosure_venue, basis, basis_comparable, classification, source_document_id, ' +
  'source_title, source_class, source_url, source_published_at, source_is_audited';

const POSITION_COLUMNS =
  'snapshot_id, company_id, as_of_date, asset, instrument_type, quantity, basis, ' +
  'basis_comparable, look_through_btc_equivalent, is_related_party_vehicle, ' +
  'includes_customer_assets, source_document_id, source_title, source_class, source_url, ' +
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
  jurisdiction: string;
  tier: ResearchTier;
  primary_archetype: ResearchArchetype;
  self_described_archetype: ResearchArchetype | null;
  reporting_standard: ReportingStandard | null;
  expected_disclosure_cadence: DisclosureCadence;
  acn: string | null;
  abn: string | null;
  arbn: string | null;
  isin: string | null;
  operational_hq: string | null;
  functional_currency: string | null;
  presentation_currency: string | null;
  financial_year_end: string | null;
  market_cap_band: string | null;
  funding_source: string | null;
  curator_notes: string | null;
  last_verified_at: string | null;
  is_published: boolean;
  company_listings: ListingRow[] | null;
  company_former_names: { name: string; used_to: string | null }[] | null;
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
  source_document_id: string;
  source_title: string;
  source_class: SourceClass;
  source_url: string | null;
  source_published_at: string | null;
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

type AbsenceRow = {
  company_id: string;
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
    acn: row.acn,
    abn: row.abn,
    arbn: row.arbn,
    isin: row.isin,
    operationalHq: row.operational_hq,
    functionalCurrency: row.functional_currency,
    presentationCurrency: row.presentation_currency,
    financialYearEnd: row.financial_year_end,
    marketCapBand: row.market_cap_band,
    fundingSource: row.funding_source,
    curatorNotes: row.curator_notes,
    lastVerifiedAt: row.last_verified_at,
    isPublished: row.is_published,
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
      opts?: { publishableOnly?: boolean } & QueryOptions,
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
        .order('event_date', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const items = ((data ?? []) as unknown as LedgerRow[]).map(toLedgerEntry);
      const total = count ?? items.length;

      return { items, total, hasMore: offset + items.length < total };
    },

    async getPosition(_ctx: ReadContext, companyId: string): Promise<PositionSummary> {
      const { data, error } = await client
        .from(POSITION_VIEW)
        .select(POSITION_COLUMNS)
        .eq('company_id', companyId)
        .order('as_of_date', { ascending: false });

      if (error) throw error;

      const rows = ((data ?? []) as unknown as PositionViewRow[]).map(toPositionRow);
      const asset = 'btc';
      const inAsset = rows.filter((row) => row.asset === asset);

      // The aggregate is decided here rather than by the caller. Handing back
      // rows and trusting three components to filter them the same way is how
      // a look-through position ends up inside a total.
      return {
        companyId,
        asset,
        comparableTotal: inAsset
          .filter((row) => row.basisComparable)
          .reduce((sum, row) => sum + row.quantity, 0),
        rows,
        excluded: inAsset.filter((row) => !row.basisComparable),
      };
    },

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

    async getStructuralAbsences(
      _ctx: ReadContext,
      companyId: string,
    ): Promise<StructuralAbsence[]> {
      const { data, error } = await client
        .from(ABSENCES_VIEW)
        .select(
          'company_id, subject, headline, detail, source_document_id, source_title, source_class, source_url, source_published_at, source_is_audited',
        )
        .eq('company_id', companyId);

      if (error) throw error;

      return ((data ?? []) as unknown as AbsenceRow[]).map((row) => ({
        companyId: row.company_id,
        subject: row.subject,
        // The detail carries the citation; the headline is the panel's label.
        statement: row.detail ?? row.headline,
        provenance: toProvenance(row),
      }));
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
