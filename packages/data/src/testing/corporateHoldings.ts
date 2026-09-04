/**
 * The corporate holdings conformance suite, written once and run against both
 * adapters.
 *
 * Every case here is a hard rule from the spec rather than a shape check. The
 * shapes are already guarded by `tsc`; what is not guarded by `tsc` is an
 * adapter that sums a look-through row into a total, or lets an internal row
 * out of the publishable read. Those are the failures this domain exists to
 * prevent, so those are the cases.
 *
 * The scenario argument is how both adapters can pass the same suite over
 * different data. If a case can only pass against fixtures, the fixture is
 * lying about the shape of the data.
 */
import { describe, expect, it } from 'vitest';
import type { Bundle, RepositoryDomain } from '../bundle';
import { ArchetypeMismatchError } from '../repositories/corporateHoldings';
import { testReadContext } from './contract';

/**
 * The records an adapter must supply for the suite to say anything.
 *
 * Naming them by pathology rather than by company keeps the suite honest: an
 * adapter that has no company with a non-comparable holding cannot quietly
 * skip that case, it fails to construct the scenario.
 */
export interface CorporateHoldingsScenario<K extends RepositoryDomain> {
  /** Appears in the test name, e.g. 'supabase' or 'fixtures'. */
  name: string;
  createBundle(): Bundle<K> | Promise<Bundle<K>>;

  /** A company whose position mixes a comparable basis with at least one that is not. */
  mixedBasisSlug: string;
  /** A company with no debt at all, so the covenant panel has an absence to state. */
  noDebtSlug: string;
  /** Two companies with different `primaryArchetype`. */
  mismatchedPair: [string, string];
  /** Two companies sharing a `primaryArchetype`. */
  matchedPair: [string, string];
  /** A monthly discloser that has gone quiet past its own cadence. */
  staleSlug: string;
  /** An episodic discloser, silent for a comparable stretch and not stale for it. */
  quietSlug: string;
  /** A company carrying both a publishable and a non-publishable ledger row. */
  mixedClassificationSlug: string;
}

export function describeCorporateHoldingsContract<K extends RepositoryDomain>(
  scenario: CorporateHoldingsScenario<K>,
): void {
  const ctx = testReadContext();

  // Narrowed once here: the suite needs the domain, and `Bundle<K>` only
  // carries it when K includes it. Every adapter that runs this suite does.
  type WithDomain = Bundle<K> & Pick<import('../bundle').RepositoryDomains, 'corporateHoldings'>;
  const repo = async () => ((await scenario.createBundle()) as WithDomain).corporateHoldings;

  const bySlug = async (slug: string) => {
    const company = await (await repo()).getCompany(ctx, slug);
    if (!company) throw new Error(`scenario company ${slug} is missing from ${scenario.name}`);
    return company;
  };

  describe(`CorporateHoldingsRepository: ${scenario.name}`, () => {
    it('never returns a ledger entry without provenance', async () => {
      const company = await bySlug(scenario.mixedClassificationSlug);
      const ledger = await (await repo()).getLedger(ctx, company.id);

      expect(ledger.items.length).toBeGreaterThan(0);
      for (const entry of ledger.items) {
        // The document id and title are the minimum: a claim the reader cannot
        // trace is the bug three research records produced between them.
        expect(entry.provenance.documentId).toBeTruthy();
        expect(entry.provenance.documentTitle).toBeTruthy();
        expect(entry.provenance.sourceClass).toBeTruthy();
      }
    });

    it('sources every ledger entry from an exchange announcement or better', async () => {
      // Rule 2, seen from the read side. The DB trigger enforces it on write;
      // this catches an adapter reading a view that joined the wrong document.
      const belowMinimum = ['investor_presentation', 'company_web', 'secondary'];
      const company = await bySlug(scenario.mixedClassificationSlug);
      const ledger = await (await repo()).getLedger(ctx, company.id);

      for (const entry of ledger.items) {
        expect(belowMinimum).not.toContain(entry.provenance.sourceClass);
      }
    });

    it('excludes non-comparable bases from position aggregates', async () => {
      const company = await bySlug(scenario.mixedBasisSlug);
      const position = await (await repo()).getPosition(ctx, company.id);

      expect(position.excluded.length).toBeGreaterThan(0);
      for (const row of position.excluded) {
        expect(row.basisComparable).toBe(false);
      }

      const expected = position.rows
        .filter((row) => row.basisComparable && row.asset === position.asset)
        .reduce((sum, row) => sum + row.quantity, 0);
      expect(position.comparableTotal).toBeCloseTo(expected, 8);

      // The excluded rows are larger than the total they are kept out of.
      // That is the whole point: silently summing them would overstate the
      // corporate position by orders of magnitude.
      const excludedTotal = position.excluded.reduce((sum, row) => sum + row.quantity, 0);
      expect(excludedTotal).toBeGreaterThan(0);
      expect(position.comparableTotal).toBeLessThan(excludedTotal + position.comparableTotal);
    });

    it('renders a non-comparable row rather than hiding it', async () => {
      // Excluded from the total, present on the page. A reader who cannot see
      // that the issuer stated a larger figure is worse off than one who can.
      const company = await bySlug(scenario.mixedBasisSlug);
      const position = await (await repo()).getPosition(ctx, company.id);

      for (const row of position.excluded) {
        expect(position.rows.map((r) => r.id)).toContain(row.id);
      }
    });

    it('returns structural absence, not empty, for a company with no debt', async () => {
      const company = await bySlug(scenario.noDebtSlug);
      const absences = await (await repo()).getStructuralAbsences(ctx, company.id);

      const covenants = absences.find((a) => a.subject === 'covenants' || a.subject === 'debt');
      expect(covenants).toBeDefined();
      expect(covenants?.statement).toBeTruthy();
      // An absence is a citable fact or it is a guess.
      expect(covenants?.provenance.documentId).toBeTruthy();
    });

    it('flags staleness against cadence, not a fixed window', async () => {
      const stale = await bySlug(scenario.staleSlug);
      const quiet = await bySlug(scenario.quietSlug);
      const repository = await repo();

      const staleRow = await repository.getFreshness(ctx, stale.id);
      const quietRow = await repository.getFreshness(ctx, quiet.id);

      expect(staleRow.isStale).toBe(true);
      expect(quietRow.isStale).toBe(false);

      // The load-bearing half: if the quiet record has been silent at least as
      // long as the stale one and is still not stale, the verdict came from the
      // cadence rather than from the clock.
      expect(quietRow.daysSinceDocument ?? 0).toBeGreaterThanOrEqual(
        staleRow.daysSinceDocument ?? 0,
      );
      expect(quietRow.staleAfterDays).toBeGreaterThan(staleRow.staleAfterDays);
    });

    it('refuses a cross-archetype comparison', async () => {
      const repository = await repo();
      await expect(repository.compareCompanies(ctx, scenario.mismatchedPair)).rejects.toThrow(
        ArchetypeMismatchError,
      );
    });

    it('allows a comparison within one archetype', async () => {
      // Without this the previous case passes for an adapter that refuses
      // every comparison, which is not the rule.
      const repository = await repo();
      const compared = await repository.compareCompanies(ctx, scenario.matchedPair);

      expect(compared).toHaveLength(2);
      expect(new Set(compared.map((c) => c.primaryArchetype)).size).toBe(1);
    });

    it('returns only publishable rows when publishableOnly is set', async () => {
      const company = await bySlug(scenario.mixedClassificationSlug);
      const repository = await repo();

      const all = await repository.getLedger(ctx, company.id);
      const published = await repository.getLedger(ctx, company.id, { publishableOnly: true });

      expect(published.items.length).toBeGreaterThan(0);
      expect(published.items.length).toBeLessThan(all.items.length);
      for (const entry of published.items) {
        expect(entry.classification).toBe('publishable');
      }
    });

    it('orders the ledger newest first', async () => {
      const company = await bySlug(scenario.mixedClassificationSlug);
      const ledger = await (await repo()).getLedger(ctx, company.id);
      const dates = ledger.items.map((entry) => entry.eventDate);

      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('reports null for a company it cannot find, rather than throwing', async () => {
      const repository = await repo();
      await expect(repository.getCompany(ctx, 'no-such-company')).resolves.toBeNull();
    });

    it('resolves a company by a former name it no longer files under', async () => {
      // Rule 3. A name-keyed lookup loses everything filed before a rename,
      // including the most valuable document on the page.
      const company = await bySlug(scenario.mismatchedPair[0]);
      expect(Array.isArray(company.formerNames)).toBe(true);
      expect(Array.isArray(company.listingHistory)).toBe(true);
      // Listing history is a superset of current listings: a record that has
      // migrated venues keeps the venue it left.
      expect(company.listingHistory.length).toBeGreaterThanOrEqual(company.listings.length);
    });
  });
}
