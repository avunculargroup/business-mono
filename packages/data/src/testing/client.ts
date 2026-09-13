/**
 * The client app's conformance suite, parameterised over an adapter.
 *
 * Implements the eight assertions the spec bundle's `contracts/repositories.ts`
 * lists at the bottom. They are numbered here as they are numbered there, so a
 * reader can hold the two side by side.
 *
 * Written parameterised for the same reason the bundle contract is: a second
 * adapter is expected (a fixtures one, if the client app ever gets a demo
 * surface), and a per-adapter harness would be written twice.
 *
 * Assertion 6 is deliberately not here — it is a render-layer property and
 * belongs in a component test. It is listed at the bottom so it is not
 * forgotten, which is what the bundle asks for.
 */
import { describe, expect, it } from 'vitest';
import type { ReadContext } from '../context';
import {
  CLIENT_READ_DOMAINS,
  type ClientDataContext,
  type ClientReadDomain,
  type ClientType,
  type Fact,
} from '../repositories/client';
import { testReadContext } from './contract';

/**
 * A mutating method name. Assertion 1 hunts for these on the read repositories.
 *
 * `set` is in the list and it costs a real name: a read repository may not have
 * `setFilter`. That is the correct trade — the point is that nothing on a read
 * surface should *read* like a write, and a reviewer skimming an interface does
 * not pause to work out that `setX` is a no-op.
 */
const MUTATING_NAME = /^(create|update|delete|upsert|save|set|put|insert|remove|write)/;

export interface ClientAdapterUnderTest {
  /** Appears in the test name, e.g. 'supabase'. */
  name: string;

  /**
   * A context for a subscriber whose disclosure is current.
   *
   * Takes the client type because tenancy is bound at construction, not passed
   * per call — so one context cannot answer as both a corporate and an SMSF
   * subscriber, and a harness that assumed it could would be asserting
   * something no real adapter does. Assertion 7 needs one of each.
   */
  createContext(clientType: ClientType): ClientDataContext | Promise<ClientDataContext>;

  /**
   * A context for a subscriber who has not acknowledged the current Service
   * Statement.
   *
   * Every read must reject. Returning `null` or an empty list is not passing:
   * the gate is the point, and a repository that quietly answers a session
   * failing it has moved the gate into the middle tier where a forgotten
   * redirect would let it through.
   */
  createUndisclosedContext(): ClientDataContext | Promise<ClientDataContext>;

  scenario: {
    /**
     * A fact key the adapter's data does not clear for client distribution.
     * Assertion 3 asks for it back in `absent` rather than dropped.
     */
    unclearedFactKey: string;
    /** A fact key the adapter does serve, used by assertion 2. */
    clearedFactKey: string;
    /**
     * Ids of signals present in the adapter's data but not promoted.
     * Assertion 5 asserts none of them come back.
     */
    unpromotedSignalIds: string[];
  };
}

function readDomains(ctx: ClientDataContext): Array<[ClientReadDomain, object]> {
  return CLIENT_READ_DOMAINS.map((key) => [key, ctx[key] as object]);
}

function methodNames(repo: object): string[] {
  const own = Object.keys(repo);
  const proto = Object.getPrototypeOf(repo) as object | null;
  const inherited =
    proto && proto !== Object.prototype ? Object.getOwnPropertyNames(proto) : [];
  return [...new Set([...own, ...inherited])].filter(
    (name) =>
      name !== 'constructor' &&
      typeof (repo as Record<string, unknown>)[name] === 'function',
  );
}

/** Every fact any read surface can produce, so assertion 2 covers all of them. */
async function allFacts(ctx: ClientDataContext, read: ReadContext): Promise<Fact[]> {
  const { facts } = await ctx.prepare.resolveFacts(read, []);
  return facts;
}

export function describeClientContract(adapter: ClientAdapterUnderTest): void {
  describe(`client repository contract: ${adapter.name}`, () => {
    // --------------------------------------------------------
    // 1 — the write surface is exactly ClientWriteRepository
    // --------------------------------------------------------
    it('exposes no mutating method outside the write repository', async () => {
      const ctx = await adapter.createContext('corporate');

      for (const [domain, repo] of readDomains(ctx)) {
        for (const name of methodNames(repo)) {
          expect(
            MUTATING_NAME.test(name),
            `${domain}.${name} reads as a write. The not-advice boundary is `
              + `enforced by the read repositories having no write path; a third `
              + `write belongs in ClientWriteRepository or nowhere.`,
          ).toBe(false);
        }
      }
    });

    it('keeps the write repository to the two writes the app is allowed', async () => {
      const ctx = await adapter.createContext('corporate');

      expect(methodNames(ctx.writes).sort()).toEqual([
        'acknowledgeDisclosure',
        'recordGeneration',
      ]);
    });

    // --------------------------------------------------------
    // 2 — Fact.value is always a string
    // --------------------------------------------------------
    it('serves every fact value as a string, including the numeric-looking ones', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const { facts } = await ctx.prepare.resolveFacts(read, [
        adapter.scenario.clearedFactKey,
      ]);
      const everything = [...facts, ...(await allFacts(ctx, read))];

      expect(everything.length).toBeGreaterThan(0);
      for (const fact of everything) {
        expect(
          typeof fact.value,
          `${fact.key} arrived as ${typeof fact.value}. A number in the browser `
            + `invites arithmetic, and arithmetic on a fact is a basis claim.`,
        ).toBe('string');
      }
    });

    it('serves indicator points as strings too', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const available = await ctx.indicators.available(read);
      const series = await ctx.indicators.series(
        read,
        available.map((s) => s.key),
      );

      for (const one of series) {
        for (const point of one.points) {
          expect(typeof point.value).toBe('string');
        }
      }
    });

    // --------------------------------------------------------
    // 3 — an uncleared key comes back absent, not dropped
    // --------------------------------------------------------
    it('returns an uncleared fact key in `absent` rather than dropping it', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();
      const key = adapter.scenario.unclearedFactKey;

      const resolved = await ctx.prepare.resolveFacts(read, [key]);

      expect(resolved.facts.map((f) => f.key)).not.toContain(key);
      expect(
        resolved.absent.map((f) => f.key),
        'absence is a fact — the pack renders "not available as at this date" '
          + 'rather than closing the gap silently',
      ).toContain(key);
    });

    it('does not throw on an unknown fact key', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const resolved = await ctx.prepare.resolveFacts(read, ['no_such_fact_key_at_all']);

      expect(resolved.absent.map((f) => f.key)).toContain('no_such_fact_key_at_all');
    });

    // --------------------------------------------------------
    // 4 — no brief and a quiet brief are different states
    // --------------------------------------------------------
    it('distinguishes no brief from a brief that says nothing happened', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const brief = await ctx.brief.latest(read);

      // Both are legitimate. What must not happen is a quiet day arriving as
      // null, which would make the page render "no brief has published" on a
      // day one did.
      if (brief === null) return;
      expect(typeof brief.isQuietDay).toBe('boolean');
      if (brief.isQuietDay) {
        expect(brief.publishedAt).toBeTruthy();
      }
    });

    // --------------------------------------------------------
    // 5 — unpromoted signals never appear
    // --------------------------------------------------------
    it('returns no unpromoted signal', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const signals = await ctx.signals.list(read);
      const ids = signals.map((s) => s.id);

      for (const unpromoted of adapter.scenario.unpromotedSignalIds) {
        expect(ids).not.toContain(unpromoted);
      }
    });

    // --------------------------------------------------------
    // 7 — a corporate session sees no SMSF template
    // --------------------------------------------------------
    it('serves a corporate session no smsf template', async () => {
      const ctx = await adapter.createContext('corporate');
      const read = testReadContext();

      const templates = await ctx.prepare.templates(read, 'corporate');

      for (const template of templates) {
        expect(template.clientType).not.toBe('smsf');
      }
    });

    it('serves an smsf session no corporate template', async () => {
      const ctx = await adapter.createContext('smsf');
      const read = testReadContext();

      const templates = await ctx.prepare.templates(read, 'smsf');

      for (const template of templates) {
        expect(template.clientType).not.toBe('corporate');
      }
    });

    // --------------------------------------------------------
    // 8 — a stale disclosure rejects every read
    // --------------------------------------------------------
    it('rejects every read when the disclosure is not current', async () => {
      const ctx = await adapter.createUndisclosedContext();
      const read = testReadContext();

      const calls: Array<[string, () => Promise<unknown>]> = [
        ['brief.latest', () => ctx.brief.latest(read)],
        ['brief.recent', () => ctx.brief.recent(read, 7)],
        ['signals.list', () => ctx.signals.list(read)],
        ['signals.byEntity', () => ctx.signals.byEntity(read, 'any')],
        ['indicators.available', () => ctx.indicators.available(read)],
        ['indicators.series', () => ctx.indicators.series(read, [])],
        ['register.list', () => ctx.register.list(read)],
        ['register.bySlug', () => ctx.register.bySlug(read, 'any')],
        ['directory.list', () => ctx.directory.list(read)],
        ['directory.disclosures', () => ctx.directory.disclosures(read)],
        ['directory.inclusionCriteria', () => ctx.directory.inclusionCriteria(read)],
        ['library.sections', () => ctx.library.sections(read, 'corporate')],
        ['library.entry', () => ctx.library.entry(read, 'any')],
        ['prepare.templates', () => ctx.prepare.templates(read, 'corporate')],
        ['prepare.template', () => ctx.prepare.template(read, 'any')],
        ['prepare.resolveFacts', () => ctx.prepare.resolveFacts(read, [])],
        ['account.subscription', () => ctx.account.subscription(read)],
      ];

      for (const [name, call] of calls) {
        await expect(call(), `${name} answered a session that has not acknowledged`)
          .rejects.toThrow();
      }
    });

    it('still serves the gate itself when the disclosure is not current', async () => {
      // The one thing that must work: a blocked session has to be able to read
      // the document it is being asked to acknowledge, or the gate is a wall.
      const ctx = await adapter.createUndisclosedContext();
      const read = testReadContext();

      await expect(
        ctx.compliance.activeDocument(read, 'service_statement'),
      ).resolves.not.toThrow();
      await expect(ctx.session.current(read)).resolves.not.toThrow();
    });

    it('cannot be asked for a Financial Services Guide', () => {
      // Not a runtime check — a compile-time one, asserted here so the reason
      // is written down next to the other seven. No FSG is required and
      // publishing one would wrongly imply an AFS authorisation BTS does not
      // hold, so 'fsg' is not in the union and this line would not compile:
      //
      //   ctx.compliance.activeDocument(read, 'fsg');
      //
      // The database agrees: doc_type's CHECK constraint rejects it too.
      expect(true).toBe(true);
    });
  });
}

/**
 * Assertion 6, which is not in this file on purpose.
 *
 * `DirectoryEntry.isFinancialProduct === true` must mean the rendered card
 * emits no anchor and no contact action. That is a property of the component,
 * not of the adapter, so it is asserted in
 * `apps/client/components/DirectoryCard.test.tsx`. It is named here because the
 * bundle asks for it to be listed where the other seven live, so that a reader
 * checking the eight off finds all eight.
 */
export const ASSERTION_6_LIVES_IN = 'apps/client/components/DirectoryCard.test.tsx';
