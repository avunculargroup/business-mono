import { parseTemplate } from '@platform/shared';
import {
  DisclosureRequiredError,
  type AbsentFact,
  type Brief,
  type ClientAccountRepository,
  type ClientBriefRepository,
  type ClientComplianceRepository,
  type ClientDataContext,
  type ClientDirectoryRepository,
  type ClientIndicatorRepository,
  type ClientLibraryRepository,
  type ClientPrepareRepository,
  type ClientRegisterRepository,
  type ClientSessionRepository,
  type ClientSignalRepository,
  type ClientType,
  type ClientWriteRepository,
  type Fact,
  type PrepareTemplate,
  type ReadContext,
  type ResolvedFacts,
  type Signal,
} from '@platform/data';
import { blocked } from '../blocked';
import {
  CLEARED_FACT_KEYS,
  UNCLEARED_FACT_KEY,
  briefs,
  commercialDisclosures,
  companyIdentity,
  companyProfile,
  complianceDocuments,
  directoryEntries,
  indicatorSeries,
  INCLUSION_CRITERIA,
  librarySections,
  registerEntries,
  signalRows,
  subscription,
  TEMPLATE_ROWS,
  SERVICE_STATEMENT_VERSION,
} from '../fixtures/client';

/**
 * The client domains, over fixtures.
 *
 * A second implementation of the same contract, which is the whole reason it
 * exists: `packages/data/src/testing/client.ts` is parameterised over an
 * adapter, and a suite that only ever runs against one adapter is a suite that
 * has been shaped around that adapter's habits without anyone noticing.
 *
 * **The gate is enforced here the same way it is in the live adapter** — as a
 * check every read runs before it answers, throwing rather than returning
 * empty. It is worth saying why the fixture version is not a shortcut: the
 * point of the contract is that a caller can rely on the throw, and an adapter
 * that returned `[]` because it had no database to be blocked by would satisfy
 * the letter of the interface while removing the guarantee.
 */

export interface ClientFixtureOptions {
  clientType: ClientType;
  /** False makes every gated read throw, for assertion 8. */
  disclosureCurrent: boolean;
  /** Defaults to now, like every other fixture repository. */
  anchor?: Date;
}

function anchorFor(options: ClientFixtureOptions, ctx: ReadContext): Date {
  return options.anchor ?? (ctx.asOf ? new Date(ctx.asOf) : new Date());
}

/**
 * A fact's label and metadata, keyed the way the live adapter's registry is.
 *
 * `cleared` is the fixture stand-in for `field_source_minimums.client_fact_class`
 * plus the RLS policy that reads it. An uncleared key is not hidden from this
 * table — it has to be here, or `resolveFacts` could not tell "not cleared"
 * apart from "never heard of it", and those are different absences.
 */
const FACTS: Record<
  string,
  { label: string; value: string; unit?: string; basis: Fact['basis']; cleared: boolean }
> = {
  btc_spot_aud: {
    label: 'Bitcoin spot price (AUD)',
    // A string, never a number. A number in the browser invites arithmetic.
    value: '168342',
    unit: 'AUD',
    basis: 'observed',
    cleared: true,
  },
  au_cash_rate: {
    label: 'RBA cash rate target',
    value: '3.60',
    unit: '%',
    basis: 'reported',
    cleared: true,
  },
  [UNCLEARED_FACT_KEY]: {
    label: 'Unrealised gain',
    value: 'n/a',
    basis: 'derived',
    cleared: false,
  },
};

export function createClientFixtureContext(
  options: ClientFixtureOptions,
): ClientDataContext {
  /** Every gated read starts here. */
  function gate(): void {
    if (!options.disclosureCurrent) throw new DisclosureRequiredError();
  }

  const session: ClientSessionRepository = {
    // Ungated on purpose: a blocked session still has to know who it is, or
    // the gate cannot say whose disclosure is outstanding.
    async current(ctx) {
      const anchor = anchorFor(options, ctx);
      return {
        userId: 'fixture-user',
        accountId: 'fixture-account',
        clientType: options.clientType,
        displayName: subscription(anchor, options.clientType).displayName,
        disclosureCurrent: options.disclosureCurrent,
      };
    },
  };

  const brief: ClientBriefRepository = {
    async latest(ctx) {
      gate();
      return briefs(anchorFor(options, ctx))[0] ?? null;
    },
    async recent(ctx, days) {
      gate();
      const anchor = anchorFor(options, ctx);
      const cutoff = new Date(anchor.getTime() - days * 86_400_000).toISOString();
      return briefs(anchor).filter((row: Brief) => row.publishedAt >= cutoff);
    },
  };

  const signals: ClientSignalRepository = {
    async list(ctx, query) {
      gate();
      // The filter is here rather than in the fixture, which is what makes
      // assertion 5 a test of the adapter. `promoted` never reaches the caller.
      const promoted = signalRows(anchorFor(options, ctx))
        .filter((row) => row.promoted)
        .map(({ promoted: _promoted, ...signal }) => signal as Signal)
        .sort((a, b) => b.observedAt.localeCompare(a.observedAt));

      const since = query?.since;
      const filtered = since ? promoted.filter((s) => s.observedAt >= since) : promoted;
      return query?.limit === undefined ? filtered : filtered.slice(0, query.limit);
    },
    async byEntity(ctx, entityId) {
      gate();
      return signalRows(anchorFor(options, ctx))
        .filter((row) => row.promoted && row.entityId === entityId)
        .map(({ promoted: _promoted, ...signal }) => signal as Signal);
    },
  };

  const indicators: ClientIndicatorRepository = {
    async series(ctx, keys, fromDate) {
      gate();
      const all = indicatorSeries(anchorFor(options, ctx));
      const wanted = keys.length > 0 ? all.filter((s) => keys.includes(s.key)) : all;
      if (!fromDate) return wanted;
      return wanted.map((s) => ({
        ...s,
        points: s.points.filter((p) => p.at >= fromDate),
      }));
    },
    async available(ctx) {
      gate();
      return indicatorSeries(anchorFor(options, ctx)).map((s) => ({
        key: s.key,
        label: s.label,
      }));
    },
  };

  const register: ClientRegisterRepository = {
    async list(ctx) {
      gate();
      return registerEntries(anchorFor(options, ctx));
    },
    async bySlug(ctx, slug) {
      gate();
      return registerEntries(anchorFor(options, ctx)).find((e) => e.slug === slug) ?? null;
    },
  };

  const directory: ClientDirectoryRepository = {
    async list(ctx) {
      gate();
      return directoryEntries(anchorFor(options, ctx));
    },
    async inclusionCriteria() {
      gate();
      return [...INCLUSION_CRITERIA];
    },
    async disclosures(ctx) {
      gate();
      return commercialDisclosures(anchorFor(options, ctx));
    },
  };

  const library: ClientLibraryRepository = {
    async sections(ctx, clientType) {
      gate();
      return librarySections(anchorFor(options, ctx))
        .filter((s) => s.clientType === 'both' || s.clientType === clientType)
        .map(({ clientType: _clientType, ...section }) => section);
    },
    async entry(ctx, slug) {
      gate();
      for (const section of librarySections(anchorFor(options, ctx))) {
        const found = section.entries.find((e) => e.slug === slug);
        if (found) return found;
      }
      return null;
    },
  };

  /**
   * The row's `clientType` wins over the body's, mirroring the live adapter.
   *
   * There it matters for a real reason: the RLS policy filters on the column,
   * so a body claiming `both` while the column says `smsf` must not widen who
   * gets the template. Copying the precedence here keeps the two adapters
   * answering the same question the same way when the two disagree.
   */
  function parse(row: (typeof TEMPLATE_ROWS)[number]): PrepareTemplate {
    const parsed = parseTemplate(row.body);
    return {
      id: row.id,
      slug: row.slug,
      version: parsed.version,
      title: parsed.title,
      artefactType: parsed.artefactType as PrepareTemplate['artefactType'],
      clientType: row.clientType,
      regulatoryReferences: parsed.regulatoryReferences,
      sections: parsed.sections,
      factsRequired: parsed.factsRequired,
    };
  }

  const prepare: ClientPrepareRepository = {
    async templates(_ctx, clientType) {
      gate();
      // Real filtering over real rows. The live adapter's fake cannot honour
      // its own `.in('client_type', …)`, so assertion 7 is split in two there
      // and whole here.
      return TEMPLATE_ROWS.filter(
        (row) => row.clientType === clientType || row.clientType === 'both',
      ).map(parse);
    },
    async template(_ctx, slug) {
      gate();
      const row = TEMPLATE_ROWS.find((r) => r.slug === slug);
      return row ? parse(row) : null;
    },
    async resolveFacts(ctx, keys): Promise<ResolvedFacts> {
      gate();
      const anchor = anchorFor(options, ctx);
      const asAt = anchor.toISOString();
      const wanted = keys.length > 0 ? keys : [...CLEARED_FACT_KEYS];

      const facts: Fact[] = [];
      const absent: AbsentFact[] = [];

      for (const key of wanted) {
        const source = FACTS[key];
        if (!source) {
          // An unknown key is an absence too, and returning it rather than
          // throwing is what lets a template survive a fact source going away.
          absent.push({ key, label: key, reason: 'no_data', asAt });
          continue;
        }
        if (!source.cleared) {
          absent.push({ key, label: source.label, reason: 'not_cleared', asAt });
          continue;
        }
        facts.push({
          key,
          label: source.label,
          value: source.value,
          ...(source.unit ? { unit: source.unit } : {}),
          asAt,
          sourceName: 'Fixture source',
          basis: source.basis,
          complianceClass: 'neutral',
        });
      }

      return { facts, absent, resolvedAt: asAt };
    },
  };

  const compliance: ClientComplianceRepository = {
    // Ungated, and it must stay that way: a blocked session has to be able to
    // read the document it is being asked to acknowledge, or the gate is a wall.
    async activeDocument(ctx, docType) {
      return (
        complianceDocuments(anchorFor(options, ctx)).find((d) => d.docType === docType) ?? null
      );
    },
    async identity() {
      gate();
      return companyIdentity();
    },
    async profile() {
      // Ungated for the same reason as activeDocument: the gate page resolves
      // the statement's variables from it before anyone has acknowledged
      // anything.
      return companyProfile();
    },
    async acknowledgements(ctx) {
      gate();
      return options.disclosureCurrent
        ? [
            {
              documentVersion: SERVICE_STATEMENT_VERSION,
              acknowledgedAt: anchorFor(options, ctx).toISOString(),
            },
          ]
        : [];
    },
  };

  const account: ClientAccountRepository = {
    async subscription(ctx) {
      gate();
      return subscription(anchorFor(options, ctx), options.clientType);
    },
  };

  /**
   * Both writes refuse, naming the table they would have touched.
   *
   * There are exactly two, and neither takes free text. A third appearing here
   * is the moment to ask whether the not-advice boundary is still enforced by
   * architecture or has quietly become a thing people remember.
   */
  const writes: ClientWriteRepository = {
    async acknowledgeDisclosure() {
      return blocked('acknowledgeDisclosure', 'client_disclosures');
    },
    async recordGeneration() {
      return blocked('recordGeneration', 'prepare_generations');
    },
  };

  return {
    session,
    brief,
    signals,
    indicators,
    register,
    directory,
    library,
    prepare,
    compliance,
    account,
    writes,
  };
}
