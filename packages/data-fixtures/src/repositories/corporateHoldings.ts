import type {
  CompanyDossier,
  CompanyFact,
  CorporateHoldingsRepository,
  FreshnessRow,
  JurisdictionNote,
  LedgerEntry,
  Paginated,
  PositionSummary,
  QueryOptions,
  ReadContext,
  RegisterEntry,
  RegisterFilter,
  StructuralAbsence,
} from '@platform/data';
import { ArchetypeMismatchError } from '@platform/data';
import { STALE_AFTER_DAYS } from '@platform/shared';
import { paginate } from '../paginate';
import {
  researchAbsences,
  researchCompanies,
  researchCompanyDocuments,
  researchFacts,
  researchJurisdictionNotes,
  researchLedger,
  researchPositions,
  researchRegister,
} from '../fixtures';

const MS_PER_DAY = 86_400_000;

/** Whole days between a `YYYY-MM-DD` and the anchor. */
function daysSince(anchor: Date, isoDate: string): number {
  return Math.floor((anchor.getTime() - Date.parse(`${isoDate}T00:00:00Z`)) / MS_PER_DAY);
}

export function createCorporateHoldingsRepository(): CorporateHoldingsRepository {
  const company = (anchor: Date, id: string): CompanyDossier | undefined =>
    researchCompanies(anchor).find((row) => row.id === id || row.slug === id);

  return {
    async listCompanies(
      ctx: ReadContext,
      filter?: RegisterFilter,
      opts?: QueryOptions,
    ): Promise<Paginated<RegisterEntry>> {
      // Filtering happens here rather than in the page, so the demo and the
      // live app cannot disagree about what a tier filter means.
      const rows = researchRegister(ctx.asOf)
        .filter((row) => (filter?.tier ? row.tier === filter.tier : true))
        .filter((row) => (filter?.archetype ? row.primaryArchetype === filter.archetype : true))
        .filter((row) =>
          filter?.jurisdiction ? row.jurisdiction === filter.jurisdiction : true,
        )
        .sort((a, b) => a.legalName.localeCompare(b.legalName));

      return paginate(rows, opts);
    },

    async getCompany(ctx: ReadContext, slug: string): Promise<CompanyDossier | null> {
      return company(ctx.asOf, slug) ?? null;
    },

    async getLedger(
      ctx: ReadContext,
      companyId: string,
      opts?: { publishableOnly?: boolean } & QueryOptions,
    ): Promise<Paginated<LedgerEntry>> {
      const found = company(ctx.asOf, companyId);
      if (!found) return paginate([], opts);

      const rows = (researchLedger(ctx.asOf)[found.id] ?? [])
        .filter((entry) =>
          // Both gates, mirroring v_research_publishable: the company is
          // published AND the field is classified publishable. Applying only
          // the second would leak an unpublished company's rows.
          opts?.publishableOnly
            ? found.isPublished && entry.classification === 'publishable'
            : true,
        )
        .sort((a, b) => b.eventDate.localeCompare(a.eventDate));

      return paginate(rows, opts);
    },

    async getPosition(ctx: ReadContext, companyId: string): Promise<PositionSummary> {
      const found = company(ctx.asOf, companyId);
      const rows = found ? (researchPositions(ctx.asOf)[found.id] ?? []) : [];

      // The asset the aggregate is about. Everything else is a row on the page
      // and never a summand — a treasury holding two assets has two positions,
      // not one larger one.
      const asset = 'btc';
      const inAsset = rows.filter((row) => row.asset === asset);

      return {
        companyId: found?.id ?? companyId,
        asset,
        comparableTotal: inAsset
          .filter((row) => row.basisComparable)
          .reduce((sum, row) => sum + row.quantity, 0),
        rows,
        excluded: inAsset.filter((row) => !row.basisComparable),
      };
    },

    async getJurisdictionNotes(
      ctx: ReadContext,
      keys: { standard?: string; venue?: string; listingType?: string },
    ): Promise<JurisdictionNote[]> {
      return researchJurisdictionNotes(ctx.asOf).filter((note) => {
        // A note with no `appliesTo` on a dimension applies on every value of
        // it. A note that matches nothing the caller asked about is dropped.
        const standard =
          note.appliesToStandard === null || note.appliesToStandard === keys.standard;
        const venue = note.appliesToVenue === null || note.appliesToVenue === keys.venue;
        const listing =
          note.appliesToListingType === null || note.appliesToListingType === keys.listingType;
        const anySpecific =
          note.appliesToStandard !== null ||
          note.appliesToVenue !== null ||
          note.appliesToListingType !== null;

        return standard && venue && listing && anySpecific;
      });
    },

    async getFreshness(ctx: ReadContext, companyId: string): Promise<FreshnessRow> {
      const found = company(ctx.asOf, companyId);
      if (!found) {
        throw new Error(`no research company ${companyId}`);
      }

      const published = (researchCompanyDocuments(ctx.asOf)[found.id] ?? [])
        .map((document) => document.publishedAt)
        .filter((date): date is string => date !== null)
        .sort();
      const latest = published.at(-1) ?? null;

      const staleAfterDays = STALE_AFTER_DAYS[found.expectedDisclosureCadence];
      const days = latest === null ? null : daysSince(ctx.asOf, latest);

      return {
        companyId: found.id,
        slug: found.slug,
        expectedDisclosureCadence: found.expectedDisclosureCadence,
        latestDocumentAt: latest,
        daysSinceDocument: days,
        staleAfterDays,
        // No document at all is not stale — it is a record nobody has fetched
        // for yet, which reads differently and is a different job to do.
        isStale: days !== null && days > staleAfterDays,
      };
    },

    async getCompanyFacts(ctx: ReadContext, companyId: string): Promise<CompanyFact[]> {
      const found = company(ctx.asOf, companyId);
      return found ? (researchFacts(ctx.asOf)[found.id] ?? []) : [];
    },

    async getStructuralAbsences(
      ctx: ReadContext,
      companyId: string,
    ): Promise<StructuralAbsence[]> {
      const found = company(ctx.asOf, companyId);
      return found ? (researchAbsences(ctx.asOf)[found.id] ?? []) : [];
    },

    async compareCompanies(ctx: ReadContext, slugs: string[]): Promise<CompanyDossier[]> {
      const found = slugs
        .map((slug) => company(ctx.asOf, slug))
        .filter((row): row is CompanyDossier => row !== undefined);

      const archetypes = [...new Set(found.map((row) => row.primaryArchetype))];
      if (archetypes.length > 1) {
        throw new ArchetypeMismatchError(archetypes);
      }

      return found;
    },
  };
}
