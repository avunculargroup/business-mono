import { describe, expect, it } from 'vitest';
import type { DemoDomain } from '@platform/data';
import { describeCorporateHoldingsContract, testReadContext } from '@platform/data/testing';
import { createFixtureRepositories } from '../bundle';
import { RESEARCH_ENTITIES } from '../fixtures/entities';

/**
 * The shared suite, run against fixtures. The Supabase adapter runs the same
 * one over the same scenario shapes — if a case can only pass here, the fixture
 * is lying about the shape of the data.
 */
describeCorporateHoldingsContract<DemoDomain>({
  name: 'fixtures',
  createBundle: () => createFixtureRepositories(),
  mixedBasisSlug: RESEARCH_ENTITIES.verrall.slug,
  noDebtSlug: RESEARCH_ENTITIES.verrall.slug,
  mismatchedPair: [RESEARCH_ENTITIES.meridian.slug, RESEARCH_ENTITIES.verrall.slug],
  matchedPair: [RESEARCH_ENTITIES.meridian.slug, RESEARCH_ENTITIES.tarra.slug],
  staleSlug: RESEARCH_ENTITIES.calder.slug,
  quietSlug: RESEARCH_ENTITIES.tarra.slug,
  mixedClassificationSlug: RESEARCH_ENTITIES.meridian.slug,
  sourceConflictSlug: RESEARCH_ENTITIES.meridian.slug,
});

const ctx = testReadContext();
const repositories = createFixtureRepositories();

describe('the register, as the demo stages it', () => {
  it('keeps a foreign exempt quotation out of the regional register', () => {
    // Technically an Australian quotation, analytically not an Australian
    // record: the listing is exempt from most of the rules that make a
    // domestic record comparable, including the cash-box test.
    const nyala = 'demo-nyala-payments';
    return repositories.corporateHoldings.getCompany(ctx, nyala).then((company) => {
      expect(company?.tier).toBe('bellwether');
      expect(company?.listings.some((l) => l.listingType === 'cdi_foreign_exempt')).toBe(true);
    });
  });

  it('carries a record whose self-description differs from its archetype', async () => {
    // The divergence is the case study, so the set has to contain one.
    const register = await repositories.corporateHoldings.listCompanies(ctx);
    const diverging = register.items.filter(
      (row) =>
        row.selfDescribedArchetype !== null &&
        row.selfDescribedArchetype !== row.primaryArchetype,
    );

    expect(diverging.length).toBeGreaterThan(0);
  });

  it('states no bitcoin quantity in prose', async () => {
    // Quantities are numeric fields carrying a basis and a source. A figure
    // typed into a sentence arrives without either, which is the failure mode
    // the whole feature is about.
    const companies = await repositories.corporateHoldings.listCompanies(ctx);
    const prose: string[] = [];

    for (const entry of companies.items) {
      const dossier = await repositories.corporateHoldings.getCompany(ctx, entry.slug);
      if (dossier?.curatorNotes) prose.push(dossier.curatorNotes);

      const ledger = await repositories.corporateHoldings.getLedger(ctx, entry.id);
      for (const row of ledger.items) {
        prose.push(row.headline);
        if (row.detail) prose.push(row.detail);
      }

      for (const absence of await repositories.corporateHoldings.getStructuralAbsences(
        ctx,
        entry.id,
      )) {
        prose.push(absence.statement);
      }
    }

    expect(prose.length).toBeGreaterThan(0);
    for (const text of prose) {
      expect(text).not.toMatch(/\d+(\.\d+)?\s?(btc|bitcoin)\b/i);
      expect(text).not.toMatch(/\b(19|20)\d{2}-\d{2}-\d{2}\b/);
    }
  });

  it('points every fixture document at a local path', async () => {
    // Never an external host. A fixture URL that resolves to something real is
    // a fixture that can be mistaken for research.
    const companies = await repositories.corporateHoldings.listCompanies(ctx);

    for (const entry of companies.items) {
      const ledger = await repositories.corporateHoldings.getLedger(ctx, entry.id);
      for (const row of ledger.items) {
        expect(row.provenance.sourceUrl).toMatch(/^\/fixtures\/docs\//);
      }
    }
  });

  it('gives every fixture an identifier that cannot resolve to a real security', async () => {
    // Four-letter tickers where real AU and NZ codes are three, and the
    // reserved XX country prefix on every ISIN.
    const companies = await repositories.corporateHoldings.listCompanies(ctx);

    for (const entry of companies.items) {
      expect(entry.slug.startsWith('demo-')).toBe(true);
      for (const listing of entry.listings) {
        expect(listing.ticker).toHaveLength(4);
      }
      const dossier = await repositories.corporateHoldings.getCompany(ctx, entry.slug);
      expect(dossier?.isin?.startsWith('XX')).toBe(true);
    }
  });

  it('moves the register with the anchor', async () => {
    const early = testReadContext(new Date('2026-01-01T00:00:00Z'));
    const late = testReadContext(new Date('2027-01-01T00:00:00Z'));

    const a = await repositories.corporateHoldings.getLedger(early, RESEARCH_ENTITIES.meridian.id);
    const b = await repositories.corporateHoldings.getLedger(late, RESEARCH_ENTITIES.meridian.id);

    expect(a.items[0].eventDate).not.toBe(b.items[0].eventDate);
    expect(b.items[0].eventDate.startsWith('2026')).toBe(true);
  });
});
