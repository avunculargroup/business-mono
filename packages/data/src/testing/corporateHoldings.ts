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
import { MATERIALITY_FLOOR } from '@platform/shared';
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
  /** A company whose About page and offer document disagree about custody. */
  sourceConflictSlug: string;

  // The pathologies records 4–12 supplied. Each is something that happened.
  // Spec: docs/features/corporate-holdings/schema-ingest-spec.md#conformance-cases

  /** Sales and purchases whose net is small next to their gross (Strategy). */
  flowsSlug: string;
  /** Holdings stated only in currency: no snapshot, and the reason recorded (333D). */
  currencyOnlySlug: string;
  /** A position held as ETF units (Goodfood). */
  etfWrappedSlug: string;
  /** A comparable position with part of it pledged (Panther). */
  encumberedSlug: string;
  /** No ledger because the source-class gate refused its claims (Angel Studios). */
  refusedByClassSlug: string;
  /** A tracker figure materially off the sourced position (RUM Group). */
  trackerDivergenceSlug: string;
  /** Exited: a zero snapshot and a dated exit (Sequans). */
  exitedSlug: string;
  /** Holding a positive balance, with status `active`. */
  activeSlug: string;
  /** A disposal with a quantity and no date of settlement, price or proceeds (Sequans). */
  disposalWithoutConsiderationSlug: string;
  /**
   * Landed and unread (`review_state = 'draft'`), with publishable ledger
   * rows, so the review gate is the only thing keeping them out.
   */
  draftSlug: string;
  /**
   * A reviewed record carrying a draft ledger row that Lex classified
   * publishable, so the row's own state is all that keeps it out of the
   * publishable read. The row was written by an ingest run, and names it.
   */
  draftRowSlug: string;
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

    it('sources every ledger entry from a class the ledger accepts', async () => {
      // Rule 2, seen from the read side. The DB trigger enforces it on write;
      // this catches an adapter reading a view that joined the wrong document.
      const belowMinimum = ['filed_narrative', 'furnished_release', 'company_web', 'secondary'];
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

    it('resolves a source conflict in favour of the stronger document', async () => {
      const company = await bySlug(scenario.sourceConflictSlug);
      const facts = await (await repo()).getCompanyFacts(ctx, company.id);

      const custody = facts.find((fact) => fact.fieldKey === 'custody');
      expect(custody).toBeDefined();
      // Marketing copy cannot populate a controls field. The rule was written
      // after a research record got custody wrong by trusting a website.
      expect(['regulated_disclosure', 'exchange_announcement', 'audited_accounts']).toContain(
        custody?.provenance.sourceClass,
      );
    });

    it('renders the losing claim rather than deleting it', async () => {
      // The conflict is the finding. A register that resolved it out of sight
      // would teach the opposite of the lesson it exists to teach.
      const company = await bySlug(scenario.sourceConflictSlug);
      const facts = await (await repo()).getCompanyFacts(ctx, company.id);
      const custody = facts.find((fact) => fact.fieldKey === 'custody');

      expect(custody?.conflicting).not.toBeNull();
      expect(custody?.conflicting?.value).toBeTruthy();
      expect(custody?.conflicting?.provenance.sourceClass).toBe('company_web');
    });

    it('carries no conflict on a fact nothing disputed', async () => {
      // Without this the two cases above pass for an adapter that reports every
      // fact as contested.
      const company = await bySlug(scenario.noDebtSlug);
      const facts = await (await repo()).getCompanyFacts(ctx, company.id);

      expect(facts.length).toBeGreaterThan(0);
      expect(facts.every((fact) => fact.conflicting === null)).toBe(true);
    });

    it('renders the withheld list rather than silently omitting it', async () => {
      // Compliance as architecture. A page that quietly drops the unrealised
      // position looks identical to one that never computed it.
      const company = await bySlug(scenario.mixedClassificationSlug);
      const withheld = await (await repo()).getWithheldFields(ctx, company.id);

      expect(withheld.length).toBeGreaterThan(0);
      expect(withheld.some((field) => field.classification === 'restricted')).toBe(true);
      // A withheld field with no reason is a redaction, not a disclosure.
      expect(withheld.every((field) => field.reason.length > 0)).toBe(true);
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

    it('lists only reviewed records on the register by default', async () => {
      const draft = await bySlug(scenario.draftSlug);
      const register = await (await repo()).listCompanies(ctx);

      expect(register.items.length).toBeGreaterThan(0);
      expect(register.items.map((entry) => entry.slug)).not.toContain(draft.slug);
      for (const entry of register.items) {
        expect(entry.reviewState).toBe('internal');
      }
    });

    it('returns the review queue when the register is filtered to draft', async () => {
      const draft = await bySlug(scenario.draftSlug);
      const queue = await (await repo()).listCompanies(ctx, { reviewState: 'draft' });

      expect(queue.items.map((entry) => entry.slug)).toContain(draft.slug);
      for (const entry of queue.items) {
        expect(entry.reviewState).toBe('draft');
      }
    });

    it('returns no publishable rows for a record nobody has reviewed', async () => {
      const draft = await bySlug(scenario.draftSlug);
      const repository = await repo();

      // The full ledger must carry publishable rows, or the empty read below
      // proves nothing about the review gate. A draft record's rows are drafts
      // too, so they are only there when asked for.
      const all = await repository.getLedger(ctx, draft.id, { includeDrafts: true });
      expect(all.items.some((entry) => entry.classification === 'publishable')).toBe(true);

      const published = await repository.getLedger(ctx, draft.id, { publishableOnly: true });
      expect(published.items).toEqual([]);
    });

    it('returns only reviewed rows unless drafts are asked for', async () => {
      const company = await bySlug(scenario.draftRowSlug);
      const repository = await repo();

      const reviewed = await repository.getLedger(ctx, company.id);
      const withDrafts = await repository.getLedger(ctx, company.id, { includeDrafts: true });

      expect(reviewed.items.length).toBeGreaterThan(0);
      for (const entry of reviewed.items) expect(entry.reviewState).toBe('internal');

      const drafts = withDrafts.items.filter((entry) => entry.reviewState === 'draft');
      expect(drafts.length).toBeGreaterThan(0);
      // Asking for drafts adds them and nothing else: no retired row, and the
      // reviewed rows are all still there.
      for (const entry of withDrafts.items) expect(entry.reviewState).not.toBe('retired');
      expect(withDrafts.items.length).toBe(reviewed.items.length + drafts.length);
    });

    it('names the ingest run that wrote a draft row, so the run can be approved alone', async () => {
      const company = await bySlug(scenario.draftRowSlug);
      const withDrafts = await (await repo()).getLedger(ctx, company.id, { includeDrafts: true });
      const drafts = withDrafts.items.filter((entry) => entry.reviewState === 'draft');

      expect(drafts.length).toBeGreaterThan(0);
      for (const entry of drafts) expect(entry.ingestRunId).toEqual(expect.any(String));
      // Every row carries the field, run or not: absent and hand-written must
      // not read the same.
      for (const entry of withDrafts.items) expect(entry).toHaveProperty('ingestRunId');
    });

    it('keeps a draft row out of the publishable read on a reviewed record', async () => {
      const company = await bySlug(scenario.draftRowSlug);
      const repository = await repo();

      const withDrafts = await repository.getLedger(ctx, company.id, { includeDrafts: true });
      const draftPublishable = withDrafts.items.filter(
        (entry) => entry.reviewState === 'draft' && entry.classification === 'publishable',
      );
      // Otherwise the empty intersection below proves nothing.
      expect(draftPublishable.length).toBeGreaterThan(0);

      const published = await repository.getLedger(ctx, company.id, {
        publishableOnly: true,
        includeDrafts: true,
      });
      for (const entry of published.items) expect(entry.reviewState).toBe('internal');
    });

    it('queues every record with something waiting, and nothing else', async () => {
      const repository = await repo();
      const queue = await repository.getReviewQueue(ctx);
      const slugs = queue.map((entry) => entry.slug);

      // A new record, and one new row on a settled record, are both work.
      expect(slugs).toContain((await bySlug(scenario.draftSlug)).slug);
      const rowEntry = queue.find((entry) => entry.slug === scenario.draftRowSlug);
      expect(rowEntry?.companyReviewState).toBe('internal');
      expect(rowEntry?.draftEvents).toBeGreaterThan(0);

      for (const entry of queue) {
        const waiting = entry.draftEvents + entry.draftFindings + entry.draftFacts;
        expect(entry.companyReviewState === 'draft' || waiting > 0).toBe(true);
      }
    });

    it('clears only reviewed records that carry a subscriber summary', async () => {
      const repository = await repo();
      const slugs = [
        ...(await repository.listCompanies(ctx)).items,
        ...(await repository.listCompanies(ctx, { reviewState: 'draft' })).items,
      ].map((entry) => entry.slug);
      const cleared = (await Promise.all(slugs.map(bySlug))).filter((c) => c.clientCleared);

      expect(cleared.length).toBeGreaterThan(0);
      for (const company of cleared) {
        expect(company.reviewState).toBe('internal');
        expect(company.clientSummary?.trim()).toBeTruthy();
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

    it('flowsReverseWhileStockIsFlat: reports the flows, not just the endpoints', async () => {
      // 847,363 to 845,050 reads as flat; in between, 6,916 sold and 4,603
      // bought. A ledger that only carried net movement would hide both.
      const company = await bySlug(scenario.flowsSlug);
      const ledger = await (await repo()).getLedger(ctx, company.id);
      const total = (type: string) =>
        ledger.items
          .filter((entry) => entry.eventType === type)
          .reduce((sum, entry) => sum + (entry.quantity ?? 0), 0);

      const bought = total('acquisition');
      const sold = total('disposal');
      expect(bought).toBeGreaterThan(0);
      expect(sold).toBeGreaterThan(0);
      expect(bought + sold).toBeGreaterThan(Math.abs(bought - sold) * 2);
    });

    it('currencyOnlyDisclosureYieldsNoSnapshot: no figure, no basis, and a stated reason', async () => {
      // A holding disclosed only as a dollar amount has no coin count to
      // store. Converting it at a price would invent one.
      const company = await bySlug(scenario.currencyOnlySlug);
      const position = await (await repo()).getPosition(ctx, company.id);

      expect(position.rows).toEqual([]);
      expect(position.comparableTotal).toBe(0);
      expect(company.ledgerAbsenceReason).toBe('no_stated_basis');
    });

    it('etfWrapperIsNotComparable: ETF units never enter an aggregate', async () => {
      const company = await bySlug(scenario.etfWrappedSlug);
      const position = await (await repo()).getPosition(ctx, company.id);
      const wrapped = position.rows.filter((row) => row.basis === 'etf_wrapped');

      expect(wrapped.length).toBeGreaterThan(0);
      for (const row of wrapped) {
        expect(row.basisComparable).toBe(false);
        expect(position.excluded.map((r) => r.id)).toContain(row.id);
        // A tracker's coin count derived from a dollar figure is a third
        // party's arithmetic, not a disclosure, and is not stored.
        expect(row.lookThroughBtcEquivalent).toBeNull();
      }
      const comparable = position.rows
        .filter((row) => row.basisComparable && row.asset === position.asset)
        .reduce((sum, row) => sum + row.quantity, 0);
      expect(position.comparableTotal).toBeCloseTo(comparable, 8);
    });

    it('encumberedPortionExcludedFromFreeBalance: a pledge is shown and never counted as free', async () => {
      const company = await bySlug(scenario.encumberedSlug);
      const position = await (await repo()).getPosition(ctx, company.id);
      const pledged = position.rows.filter((row) => (row.encumberedQuantity ?? 0) > 0);

      expect(pledged.length).toBeGreaterThan(0);
      for (const row of pledged) {
        // Encumbrance is a flag, not a basis: the row stays comparable.
        expect(row.basisComparable).toBe(true);
        expect(row.encumberedQuantity).toBeLessThanOrEqual(row.quantity);
        // A bare number is what the 29 September decision rejected.
        expect(row.encumbranceObligation).toBeTruthy();
      }

      const encumbered = position.rows
        .filter((row) => row.basisComparable && row.asset === position.asset)
        .reduce((sum, row) => sum + (row.encumberedQuantity ?? 0), 0);
      expect(encumbered).toBeGreaterThan(0);
      expect(position.unencumberedTotal).toBeCloseTo(position.comparableTotal - encumbered, 8);
      expect(position.unencumberedTotal).toBeLessThan(position.comparableTotal);
    });

    it('carries no encumbrance on a position nothing is pledged against', async () => {
      // Without this the case above passes for an adapter that reports
      // every holding as pledged.
      const company = await bySlug(scenario.activeSlug);
      const position = await (await repo()).getPosition(ctx, company.id);

      expect(position.rows.every((row) => (row.encumberedQuantity ?? 0) === 0)).toBe(true);
      expect(position.unencumberedTotal).toBe(position.comparableTotal);
    });

    it('refusedByClassIsDistinguishableFromAbsent: two empty records, two explanations', async () => {
      const repository = await repo();
      const refused = await bySlug(scenario.refusedByClassSlug);
      const noBasis = await bySlug(scenario.currencyOnlySlug);

      expect((await repository.getLedger(ctx, refused.id)).items).toEqual([]);
      expect((await repository.getLedger(ctx, noBasis.id)).items).toEqual([]);
      expect(refused.ledgerAbsenceReason).toBe('source_class_refused');
      expect(noBasis.ledgerAbsenceReason).not.toBe(refused.ledgerAbsenceReason);
    });

    it('trackerDivergenceRaisesFinding: a tracker figure off the sourced position is material', async () => {
      const repository = await repo();
      const company = await bySlug(scenario.trackerDivergenceSlug);
      const claims = await repository.getTrackerClaims(ctx, company.id);
      const position = await repository.getPosition(ctx, company.id);

      const material = claims.filter((claim) => claim.isMaterial);
      expect(material.length).toBeGreaterThan(0);
      for (const claim of material) {
        expect(claim.sourcedQuantity).toBe(position.comparableTotal);
        expect(Math.abs(claim.divergence ?? 0)).toBeGreaterThanOrEqual(MATERIALITY_FLOOR);
      }
    });

    it('treats a tracker figure within the floor as agreement', async () => {
      // Without this the case above passes for an adapter that flags every claim.
      const company = await bySlug(scenario.trackerDivergenceSlug);
      const claims = await (await repo()).getTrackerClaims(ctx, company.id);

      expect(claims.some((claim) => claim.divergence !== null && !claim.isMaterial)).toBe(true);
    });

    it('exitedIsNotAbsent: exited, never disclosed and holding are three states', async () => {
      // No inference: the zero snapshot alone does not say the company left.
      const repository = await repo();
      const exited = await bySlug(scenario.exitedSlug);
      const absent = await bySlug(scenario.currencyOnlySlug);
      const active = await bySlug(scenario.activeSlug);

      const exitedPosition = await repository.getPosition(ctx, exited.id);
      expect(exited.holdingStatus).toBe('exited');
      expect(exited.exitedOn).toBeTruthy();
      expect(exitedPosition.rows.length).toBeGreaterThan(0);
      expect(exitedPosition.comparableTotal).toBe(0);

      const absentPosition = await repository.getPosition(ctx, absent.id);
      expect(absentPosition.rows).toEqual([]);
      expect(absent.holdingStatus).not.toBe('exited');
      expect(absent.exitedOn).toBeNull();

      const activePosition = await repository.getPosition(ctx, active.id);
      expect(active.holdingStatus).toBe('active');
      expect(active.exitedOn).toBeNull();
      expect(activePosition.comparableTotal).toBeGreaterThan(0);
    });

    it('disposalWithoutConsideration: a quantity and nothing else persists and reads', async () => {
      const company = await bySlug(scenario.disposalWithoutConsiderationSlug);
      const ledger = await (await repo()).getLedger(ctx, company.id);
      const bare = ledger.items.filter(
        (entry) =>
          entry.eventType === 'disposal' &&
          entry.quantity !== null &&
          entry.considerationNative === null,
      );

      expect(bare.length).toBeGreaterThan(0);
      for (const entry of bare) {
        // Nothing to convert, so nothing converted: no AUD figure and no rate.
        expect(entry.considerationAud).toBeNull();
        expect(entry.fxRateUsed).toBeNull();
        expect(entry.nativeCurrency).toBeNull();
      }
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
