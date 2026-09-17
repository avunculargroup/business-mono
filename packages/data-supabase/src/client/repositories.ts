import type {
  Brief,
  ClientAccountRepository,
  ClientBriefRepository,
  ClientComplianceRepository,
  ClientDirectoryRepository,
  ClientIndicatorRepository,
  ClientLibraryRepository,
  ClientPrepareRepository,
  ClientProvenance,
  ClientRegisterEntry,
  ClientRegisterRepository,
  ClientSession,
  ClientSessionRepository,
  ClientSignalRepository,
  ClientSubscription,
  ClientType,
  CommercialDisclosure,
  ComplianceClass,
  CompanyProfile,
  ComplianceDocument,
  DirectoryEntry,
  Finding,
  FindingType,
  IndicatorSeries,
  LibrarySection,
  PrepareTemplate,
  ReadContext,
  Signal,
} from '@platform/data';
import { parseTemplate } from '@platform/shared';
import { requireDisclosure, type ClientAdapterContext } from './context';
import { resolveFacts } from './facts';

const FINDING_TYPES: readonly FindingType[] = [
  'anomaly',
  'divergence',
  'inflection',
  'streak',
  'threshold',
  'staleness',
];

const COMPLIANCE_CLASSES: readonly ComplianceClass[] = [
  'neutral',
  'valuation_adjacent',
  'advice_adjacent',
  'solvency_adjacent',
];

/**
 * Narrows a free-text database column to the union the contract declares.
 *
 * The columns are `TEXT` with CHECK constraints rather than enums, so a value
 * outside the union is possible in principle. Falling back to the most
 * conservative member is the right failure: an unrecognised compliance class
 * treated as `solvency_adjacent` hides a row that should perhaps have shown,
 * whereas treating it as `neutral` shows one that should perhaps have been
 * gated.
 */
function toComplianceClass(value: string | null): ComplianceClass {
  return COMPLIANCE_CLASSES.includes(value as ComplianceClass)
    ? (value as ComplianceClass)
    : 'solvency_adjacent';
}

function toFindingType(value: unknown): FindingType {
  return FINDING_TYPES.includes(value as FindingType) ? (value as FindingType) : 'anomaly';
}

// ============================================================
// Session
// ============================================================

export function createClientSessionRepository(
  adapter: ClientAdapterContext,
): ClientSessionRepository {
  return {
    /**
     * Not gated on the disclosure — this is what the gate itself renders from,
     * and a session that cannot read its own name cannot be shown a document to
     * acknowledge.
     */
    async current(_ctx: ReadContext): Promise<ClientSession | null> {
      const { data, error } = await adapter.client
        .from('client_users')
        .select('id, account_id')
        .eq('id', adapter.principal.userId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const { data: account, error: accountError } = await adapter.client
        .from('client_accounts')
        .select('display_name, client_type')
        .eq('id', data.account_id)
        .maybeSingle();

      if (accountError) throw accountError;
      if (!account) return null;

      return {
        userId: data.id,
        accountId: data.account_id,
        clientType: account.client_type as ClientType,
        displayName: account.display_name,
        disclosureCurrent: await adapter.disclosureCurrent(),
      };
    },
  };
}

// ============================================================
// The Brief
// ============================================================

type MarketReportRow = {
  id: string;
  as_of: string | null;
  report_mode: string | null;
  narration_markdown: string | null;
  findings: unknown;
};

function toBrief(row: MarketReportRow): Brief {
  const raw = Array.isArray(row.findings) ? row.findings : [];

  const findings: Finding[] = raw.map((item, index) => {
    const one = (item ?? {}) as Record<string, unknown>;
    const provenance = Array.isArray(one['provenance'])
      ? (one['provenance'] as Array<Record<string, unknown>>)
      : [];

    return {
      id: typeof one['id'] === 'string' ? one['id'] : `${row.id}-${index}`,
      findingType: toFindingType(one['finding_type'] ?? one['findingType']),
      headline: String(one['headline'] ?? ''),
      detail: String(one['detail'] ?? ''),
      asAt: String(one['as_at'] ?? one['asAt'] ?? row.as_of ?? ''),
      provenance: provenance.map((p): ClientProvenance => ({
        sourceName: String(p['source_name'] ?? p['sourceName'] ?? 'Unattributed'),
        ...(typeof (p['source_url'] ?? p['sourceUrl']) === 'string'
          ? { sourceUrl: String(p['source_url'] ?? p['sourceUrl']) }
          : {}),
        asAt: String(p['as_at'] ?? p['asAt'] ?? row.as_of ?? ''),
        basis: 'reported',
      })),
    };
  });

  return {
    id: row.id,
    publishedAt: row.as_of ?? '',
    narration: row.narration_markdown ?? '',
    findings,
    // A column, not an inference from an empty list. A quiet day is a published
    // report that says nothing cleared the floor; no report at all is `null`
    // from `latest()`. Different states, and the page renders them differently.
    isQuietDay: row.report_mode === 'quiet',
  };
}

const BRIEF_COLUMNS = 'id, as_of, report_mode, narration_markdown, findings';

export function createClientBriefRepository(
  adapter: ClientAdapterContext,
): ClientBriefRepository {
  return {
    async latest(ctx: ReadContext): Promise<Brief | null> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('market_reports')
        .select(BRIEF_COLUMNS)
        .eq('status', 'published')
        .lte('as_of', ctx.asOf.toISOString().slice(0, 10))
        .order('as_of', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data ? toBrief(data as MarketReportRow) : null;
    },

    async recent(ctx: ReadContext, days: number): Promise<Brief[]> {
      await requireDisclosure(adapter);

      const from = new Date(ctx.asOf.getTime() - days * 86_400_000);
      const { data, error } = await adapter.client
        .from('market_reports')
        .select(BRIEF_COLUMNS)
        .eq('status', 'published')
        .gte('as_of', from.toISOString().slice(0, 10))
        .lte('as_of', ctx.asOf.toISOString().slice(0, 10))
        .order('as_of', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => toBrief(row as MarketReportRow));
    },
  };
}

// ============================================================
// Signals
// ============================================================

type SignalRow = {
  id: string;
  entity_name: string | null;
  product_service_id: string | null;
  advisor_partner_id: string | null;
  change_type: string | null;
  title: string | null;
  summary: string | null;
  compliance_class: string | null;
  client_note: string | null;
  occurred_at: string | null;
  detected_at: string | null;
  external_url: string | null;
  source: string | null;
  payload: unknown;
};

/**
 * Change types that describe something that did *not* happen.
 *
 * "Last attested 401 days ago, expected cadence quarterly" is a signal, and
 * arguably the most valuable one on the page — so it renders as a first-class
 * item rather than as a gap. Matching on a prefix rather than an exact list
 * because the ingest side coins new absence types faster than this list would
 * be updated, and a missed absence renders as an ordinary signal, which is a
 * mild failure rather than a leak.
 */
function isAbsence(changeType: string | null): boolean {
  if (!changeType) return false;
  return /^(missing|absent|stale|not_|no_|lapsed|expired|overdue)/.test(changeType);
}

// One literal for the same reason as the selects below: a concatenation widens
// to `string` and loses the inferred row type.
const SIGNAL_COLUMNS =
  'id, entity_name, product_service_id, advisor_partner_id, change_type, title, summary, compliance_class, client_note, occurred_at, detected_at, external_url, source, payload';

function toSignal(row: SignalRow): Signal {
  const payload = (row.payload ?? {}) as Record<string, unknown>;
  const previous = payload['previous_state'] ?? payload['previous'] ?? payload['from'];
  const current = payload['current_state'] ?? payload['current'] ?? payload['to'];
  const observedAt = row.occurred_at ?? row.detected_at ?? '';

  return {
    id: row.id,
    entityName: row.entity_name ?? 'Unnamed entity',
    entityId: row.product_service_id ?? row.advisor_partner_id,
    changeType: row.change_type ?? 'change',
    previousState: typeof previous === 'string' ? previous : null,
    currentState: typeof current === 'string' ? current : (row.title ?? ''),
    observedAt,
    complianceClass: toComplianceClass(row.compliance_class),
    // client_note only. curator_note is written for a director and is allowed
    // to editorialise; it is not selected above, so it cannot leak by mistake.
    clientNote: row.client_note,
    provenance: {
      sourceName: row.source ?? 'Ecosystem watch',
      ...(row.external_url ? { sourceUrl: row.external_url } : {}),
      asAt: observedAt,
      basis: 'observed',
    },
    isAbsenceSignal: isAbsence(row.change_type),
  };
}

export function createClientSignalRepository(
  adapter: ClientAdapterContext,
): ClientSignalRepository {
  return {
    async list(_ctx: ReadContext, query = {}): Promise<Signal[]> {
      await requireDisclosure(adapter);

      // client_relevant and client_promoted_by are also the RLS predicate, so
      // this filter is belt and braces. Both are deliberate: the policy is what
      // makes a forgotten filter safe, and the filter is what makes the query
      // readable to someone who has not read the policy.
      let builder = adapter.client
        .from('ecosystem_changes')
        .select(SIGNAL_COLUMNS)
        .eq('client_relevant', true)
        .not('client_promoted_by', 'is', null)
        .order('occurred_at', { ascending: false, nullsFirst: false });

      if (query.since) builder = builder.gte('occurred_at', query.since);
      if (query.categories?.length) builder = builder.in('change_type', query.categories);
      builder = builder.limit(query.limit ?? 50);

      const { data, error } = await builder;

      if (error) throw error;
      return (data ?? []).map((row) => toSignal(row as SignalRow));
    },

    async byEntity(_ctx: ReadContext, entityId: string): Promise<Signal[]> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('ecosystem_changes')
        .select(SIGNAL_COLUMNS)
        .eq('client_relevant', true)
        .not('client_promoted_by', 'is', null)
        .or(`product_service_id.eq.${entityId},advisor_partner_id.eq.${entityId}`)
        .order('occurred_at', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return (data ?? []).map((row) => toSignal(row as SignalRow));
    },
  };
}

// ============================================================
// Indicators
// ============================================================

/**
 * Cadence in days, from the poll frequency the indicator declares.
 *
 * Drives the freshness indicator — the only gold on the page — so an unknown
 * frequency maps to a long cadence rather than a short one. Over-reporting
 * staleness on every series would train the reader to ignore the colour, which
 * costs more than missing one stale series.
 */
function cadenceDays(frequency: string | null): number {
  switch (frequency) {
    case 'hourly':
    case 'daily':
      return 1;
    case 'weekly':
      return 7;
    case 'monthly':
      return 31;
    case 'quarterly':
      return 92;
    default:
      return 365;
  }
}

export function createClientIndicatorRepository(
  adapter: ClientAdapterContext,
): ClientIndicatorRepository {
  return {
    async available(_ctx: ReadContext): Promise<Array<{ key: string; label: string }>> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('onchain_indicators')
        .select('key, name, short_label')
        .eq('is_active', true)
        .eq('is_displayed', true)
        .order('key');

      if (error) throw error;
      return (data ?? [])
        .filter((row): row is typeof row & { key: string } => Boolean(row.key))
        .map((row) => ({ key: row.key, label: row.short_label ?? row.name ?? row.key }));
    },

    async series(
      _ctx: ReadContext,
      keys: string[],
      fromDate?: string,
    ): Promise<IndicatorSeries[]> {
      await requireDisclosure(adapter);
      if (keys.length === 0) return [];

      const { data, error } = await adapter.client
        .from('onchain_indicators')
        .select(
          'key, name, short_label, unit, decimals, provider, poll_frequency, onchain_observations(value, observed_at, is_current)',
        )
        .in('key', keys);

      if (error) throw error;

      const out: IndicatorSeries[] = [];

      for (const row of data ?? []) {
        if (!row.key) continue;
        const observations = ((row.onchain_observations ?? []) as Array<{
          value: number | null;
          observed_at: string | null;
          is_current: boolean | null;
        }>)
          .filter((o) => o.value !== null && o.observed_at !== null)
          .filter((o) => (fromDate ? o.observed_at! >= fromDate : true))
          .sort((a, b) => (a.observed_at! < b.observed_at! ? -1 : 1));

        if (observations.length === 0) continue;

        const digits = row.decimals ?? 2;
        out.push({
          key: row.key,
          label: row.short_label ?? row.name ?? row.key,
          ...(row.unit ? { unit: row.unit } : {}),
          sourceName: row.provider ?? 'Unattributed',
          expectedCadenceDays: cadenceDays(row.poll_frequency),
          lastObservedAt: observations.at(-1)!.observed_at!,
          // Formatted here, once, so nothing downstream can do arithmetic on a
          // series point. Same rule as Fact.value.
          points: observations.map((o) => ({
            at: o.observed_at!,
            value: new Intl.NumberFormat('en-AU', {
              minimumFractionDigits: digits,
              maximumFractionDigits: digits,
            }).format(o.value!),
          })),
        });
      }

      return out;
    },
  };
}

// ============================================================
// Register
// ============================================================

type RegisterRow = {
  slug: string | null;
  legal_name: string | null;
  jurisdiction: string | null;
  tier: string | null;
  company_listings: Array<{ ticker: string | null }> | null;
  research_company_facts: Array<{
    field_key: string | null;
    label: string | null;
    value: string | null;
    as_of: string | null;
    is_superseded: boolean | null;
  }> | null;
  treasury_events: Array<{
    event_date: string | null;
    headline: string | null;
    detail: string | null;
    basis: string | null;
    disclosure_venue: string | null;
  }> | null;
};

const REGISTER_COLUMNS =
  'slug, legal_name, jurisdiction, tier, company_listings(ticker), research_company_facts(field_key, label, value, as_of, is_superseded), treasury_events(event_date, headline, detail, basis, disclosure_venue)';

/**
 * Field keys whose facts describe how an entity implemented something.
 *
 * Read from `field_source_minimums.client_fact_class`, which the RLS policy
 * also reads — so an outcome fact does not reach this process at all, and this
 * filter is the second of two locks rather than the only one.
 *
 * Fetched once per bundle and memoised, because it is a seven-row lookup that
 * every register read would otherwise repeat.
 */
async function implementationFactKeys(
  adapter: ClientAdapterContext,
): Promise<Set<string>> {
  const { data, error } = await adapter.client
    .from('field_source_minimums')
    .select('field_key, client_fact_class')
    .eq('client_fact_class', 'implementation');

  if (error) throw error;
  return new Set((data ?? []).map((row) => row.field_key));
}

/**
 * Facts a register entry is expected to state, so a missing one can be named.
 *
 * Absence is a fact: a reader who cannot see whether an entity has disclosed
 * its custody arrangement is worse off than one told it has not. So the entry
 * carries the gap explicitly rather than rendering a shorter list.
 */
const EXPECTED_FIELDS: ReadonlyArray<[string, string]> = [
  ['custody_arrangement', 'Custody arrangement'],
  ['holdings_basis', 'Basis of stated holdings'],
  ['auditor', 'Auditor'],
];

function toRegisterEntry(
  row: RegisterRow,
  implementationKeys: Set<string>,
): ClientRegisterEntry {
  const facts = (row.research_company_facts ?? [])
    .filter((f) => !f.is_superseded)
    // Implementation facts only. "How did they do it" is precedent; "how did it
    // go for them" is performance, and performance figures about named listed
    // securities is the one shape this product must not take. An unclassified
    // key fails this test, which is the intended direction.
    .filter((f) => f.field_key !== null && implementationKeys.has(f.field_key));

  const position = facts
    .filter((f) => f.value !== null)
    .map((f) => ({
      label: f.label ?? f.field_key ?? 'Fact',
      value: f.value!,
      asAt: f.as_of ?? '',
    }));

  const present = new Set(facts.map((f) => f.field_key));
  const statedAbsences = EXPECTED_FIELDS.filter(([key]) => !present.has(key)).map(
    ([, label]) => ({
      label,
      reason: 'Not disclosed in any document the register holds',
    }),
  );

  const ledger = (row.treasury_events ?? [])
    .filter((e) => e.event_date)
    .sort((a, b) => (a.event_date! < b.event_date! ? 1 : -1))
    .map((e) => ({
      eventDate: e.event_date!,
      description: e.headline ?? e.detail ?? 'Treasury event',
      provenance: {
        sourceName: e.disclosure_venue ?? 'Regulated disclosure',
        asAt: e.event_date!,
        basis: 'reported' as const,
      },
    }));

  return {
    slug: row.slug ?? '',
    entityName: row.legal_name ?? 'Unnamed entity',
    jurisdiction: row.jurisdiction ?? 'Unstated',
    // Ticker is never a key — display only, and an entity may have none.
    tickers: (row.company_listings ?? [])
      .map((l) => l.ticker)
      .filter((t): t is string => Boolean(t)),
    tier: row.tier ?? 'unclassified',
    position,
    ledger,
    statedAbsences,
    provenance: ledger.map((l) => l.provenance),
  };
}

export function createClientRegisterRepository(
  adapter: ClientAdapterContext,
): ClientRegisterRepository {
  return {
    async list(_ctx: ReadContext): Promise<ClientRegisterEntry[]> {
      await requireDisclosure(adapter);

      const [{ data, error }, implementationKeys] = await Promise.all([
        adapter.client
          .from('research_companies')
          .select(REGISTER_COLUMNS)
          .eq('is_published', true)
          .eq('client_cleared', true)
          .order('legal_name'),
        implementationFactKeys(adapter),
      ]);

      if (error) throw error;
      return (data ?? []).map((row) => toRegisterEntry(row as RegisterRow, implementationKeys));
    },

    async bySlug(_ctx: ReadContext, slug: string): Promise<ClientRegisterEntry | null> {
      await requireDisclosure(adapter);

      const [{ data, error }, implementationKeys] = await Promise.all([
        adapter.client
          .from('research_companies')
          .select(REGISTER_COLUMNS)
          .eq('is_published', true)
          .eq('client_cleared', true)
          .eq('slug', slug)
          .maybeSingle(),
        implementationFactKeys(adapter),
      ]);

      if (error) throw error;
      return data ? toRegisterEntry(data as RegisterRow, implementationKeys) : null;
    },
  };
}

// ============================================================
// Directory
// ============================================================

/**
 * The published inclusion criteria.
 *
 * On the page, not in a help doc — the spec is explicit about that, and the
 * reason is that criteria nobody can see are indistinguishable from no criteria.
 * Held here rather than in a table because they are not data: changing who gets
 * listed changes what the directory is, and a code review is where a change
 * like that should surface.
 *
 * Still an open question in the spec bundle: objective and published is the
 * requirement, and what they actually say is undecided.
 */
const INCLUSION_CRITERIA: readonly string[] = Object.freeze([
  'Operating in Australia and serving Australian clients.',
  'Registered with AUSTRAC where the service requires it.',
  'Holding a current AFSL, or having lodged an application, where the service requires one.',
  'A verifiable Australian support channel.',
  'Listing is free. No entity pays to be included, and none can pay for placement.',
]);

export function createClientDirectoryRepository(
  adapter: ClientAdapterContext,
): ClientDirectoryRepository {
  async function disclosureByEntity(): Promise<Map<string, string>> {
    const { data, error } = await adapter.client
      .from('commercial_relationships')
      .select('entity_id, disclosure_text')
      .eq('is_active', true);

    if (error) throw error;
    return new Map((data ?? []).map((row) => [row.entity_id, row.disclosure_text]));
  }

  return {
    async list(_ctx: ReadContext): Promise<DirectoryEntry[]> {
      await requireDisclosure(adapter);

      const [{ data, error }, disclosures] = await Promise.all([
        adapter.client
          .from('products_services')
          .select('id, name, category, australian_owned, is_financial_product')
          // An unassessed row is invisible. Also the RLS predicate; both on
          // purpose, for the same reason as the signals filter.
          .not('is_financial_product', 'is', null)
          .order('category')
          .order('name'),
        disclosureByEntity(),
      ]);

      if (error) throw error;

      return (data ?? []).map((row) => ({
        id: row.id,
        name: row.name ?? 'Unnamed',
        category: row.category ?? 'Uncategorised',
        australianOwned: row.australian_owned ?? false,
        isFinancialProduct: row.is_financial_product ?? true,
        // The regulatory_register watch is an ecosystem_watches watch_type, and
        // no view joins its current state to a product yet. Null renders as
        // "status not currently tracked", which is an honest statement and a
        // better one than a stale status — see the spec: under the transition
        // arrangements a stale status is worse than none.
        regulatoryStatus: null,
        // null means BTS has no relationship. The card renders that
        // affirmatively rather than leaving a blank.
        disclosure: disclosures.get(row.id) ?? null,
      }));
    },

    async inclusionCriteria(_ctx: ReadContext): Promise<string[]> {
      await requireDisclosure(adapter);
      return [...INCLUSION_CRITERIA];
    },

    async disclosures(_ctx: ReadContext): Promise<CommercialDisclosure[]> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('commercial_relationships')
        .select(
          'entity_id, entity_type, relationship_type, direction, fee_basis, disclosure_text, started_at',
        )
        .eq('is_active', true)
        .order('started_at', { ascending: false, nullsFirst: false });

      if (error) throw error;

      const productIds = (data ?? [])
        .filter((r) => r.entity_type === 'product_service')
        .map((r) => r.entity_id);
      const advisorIds = (data ?? [])
        .filter((r) => r.entity_type === 'advisor_partner')
        .map((r) => r.entity_id);

      type NameLookup = {
        data: Array<{ id: string; name: string | null }>;
        error: { message: string } | null;
      };

      const [products, advisors] = await Promise.all([
        productIds.length
          ? adapter.client.from('products_services').select('id, name').in('id', productIds)
          : Promise.resolve({ data: [], error: null } satisfies NameLookup),
        advisorIds.length
          ? adapter.client.from('advisors_partners').select('id, name').in('id', advisorIds)
          : Promise.resolve({ data: [], error: null } satisfies NameLookup),
      ]);

      if (products.error) throw products.error;
      if (advisors.error) throw advisors.error;

      const names = new Map<string, string>();
      for (const row of products.data ?? []) names.set(row.id, row.name ?? 'Unnamed');
      for (const row of advisors.data ?? []) names.set(row.id, row.name ?? 'Unnamed');

      return (data ?? []).map((row) => ({
        entityName: names.get(row.entity_id) ?? 'Unnamed entity',
        relationshipType: row.relationship_type,
        direction: row.direction,
        // `no_fees_mvp` makes this the only value the column can hold. The cast
        // is the type system agreeing with the constraint rather than trusting
        // the row.
        feeBasis: 'none',
        // Verbatim. Not generated, not templated — the whole point of the
        // column is that a person wrote the sentence being published.
        disclosureText: row.disclosure_text,
        startedAt: row.started_at,
      }));
    },
  };
}

// ============================================================
// Library
// ============================================================

export function createClientLibraryRepository(
  adapter: ClientAdapterContext,
): ClientLibraryRepository {
  return {
    async sections(_ctx: ReadContext, clientType: ClientType): Promise<LibrarySection[]> {
      await requireDisclosure(adapter);

      // Two queries rather than an embedded select. The bridge types in
      // packages/db carry no PostgREST relationship metadata, so an embed does
      // not type — and rather than hand-write that metadata into a file whose
      // whole purpose is to be deleted, the join happens here. Revisit when the
      // generated types catch up.
      const { data: sections, error: sectionsError } = await adapter.client
        .from('client_library_sections')
        .select('id, key, title, sort_order')
        .in('client_type', ['both', clientType])
        .order('sort_order');

      if (sectionsError) throw sectionsError;
      if (!sections?.length) return [];

      const { data: entries, error: entriesError } = await adapter.client
        .from('client_library_entries')
        .select(
          // One literal, not a concatenation: supabase-js infers the row type
          // from the select string at the type level, and `'a' + 'b'` widens to
          // `string`, which infers as GenericStringError instead of a row.
          'section_id, slug, title, body, regulatory_references, last_reviewed_at, review_due_date, sort_order',
        )
        .eq('status', 'published')
        .in('section_id', sections.map((section) => section.id))
        .order('sort_order');

      if (entriesError) throw entriesError;

      const bySection = new Map<string, LibrarySection['entries']>();
      for (const entry of entries ?? []) {
        const list = bySection.get(entry.section_id) ?? [];
        list.push({
          slug: entry.slug,
          title: entry.title,
          body: entry.body,
          regulatoryReferences: entry.regulatory_references ?? [],
          lastReviewedAt: entry.last_reviewed_at ?? '',
          reviewDueDate: entry.review_due_date,
        });
        bySection.set(entry.section_id, list);
      }

      return sections.map((section) => ({
        key: section.key,
        title: section.title,
        entries: bySection.get(section.id) ?? [],
      }));
    },

    async entry(_ctx: ReadContext, slug: string) {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('client_library_entries')
        .select('slug, title, body, regulatory_references, last_reviewed_at, review_due_date')
        .eq('status', 'published')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        slug: data.slug,
        title: data.title,
        body: data.body,
        regulatoryReferences: data.regulatory_references ?? [],
        lastReviewedAt: data.last_reviewed_at ?? '',
        reviewDueDate: data.review_due_date,
      };
    },
  };
}

// ============================================================
// Prepare
// ============================================================

type TemplateRow = {
  id: string;
  slug: string;
  version: string;
  title: string;
  artefact_type: string;
  client_type: string;
  regulatory_references: string[] | null;
  facts_required: string[] | null;
  body: string;
};

/**
 * Front matter loses to the row.
 *
 * The body's YAML and the columns carry the same fields, and they can disagree
 * — a founder editing the body without bumping the column, most likely. The
 * columns win because they are what the CHECK constraints and the RLS policy
 * see: `prepare_templates_client_read` filters on `client_type`, so a body
 * claiming `both` while the column says `smsf` must not widen who gets it.
 */
function toPrepareTemplate(row: TemplateRow): PrepareTemplate {
  const parsed = parseTemplate(row.body);

  return {
    id: row.id,
    slug: row.slug,
    version: row.version,
    title: row.title,
    artefactType: row.artefact_type as PrepareTemplate['artefactType'],
    clientType: row.client_type as PrepareTemplate['clientType'],
    regulatoryReferences: row.regulatory_references ?? parsed.regulatoryReferences,
    factsRequired: row.facts_required ?? parsed.factsRequired,
    sections: parsed.sections,
  };
}

const TEMPLATE_COLUMNS =
  'id, slug, version, title, artefact_type, client_type, regulatory_references, facts_required, body';

export function createClientPrepareRepository(
  adapter: ClientAdapterContext,
): ClientPrepareRepository {
  return {
    async templates(_ctx: ReadContext, clientType: ClientType): Promise<PrepareTemplate[]> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('prepare_templates')
        .select(TEMPLATE_COLUMNS)
        .eq('status', 'active')
        .in('client_type', ['both', clientType])
        .order('title');

      if (error) throw error;
      return (data ?? []).map((row) => toPrepareTemplate(row as TemplateRow));
    },

    async template(_ctx: ReadContext, slug: string): Promise<PrepareTemplate | null> {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('prepare_templates')
        .select(TEMPLATE_COLUMNS)
        .eq('status', 'active')
        .eq('slug', slug)
        .maybeSingle();

      if (error) throw error;
      return data ? toPrepareTemplate(data as TemplateRow) : null;
    },

    resolveFacts(ctx: ReadContext, keys: string[]) {
      return resolveFacts(adapter, ctx, keys);
    },
  };
}

// ============================================================
// Compliance and identity
// ============================================================

export function createClientComplianceRepository(
  adapter: ClientAdapterContext,
): ClientComplianceRepository {
  return {
    async identity(_ctx: ReadContext) {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('company_profile')
        .select('legal_name, trading_name, abn, acn')
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        legalName: data.legal_name,
        tradingName: data.trading_name,
        abn: data.abn,
        acn: data.acn,
      };
    },

    /**
     * Not gated, for the same reason `activeDocument` is not: the Service
     * Statement is rendered from this, and a blocked session has to be able to
     * read the document it is being asked to acknowledge.
     */
    async profile(_ctx: ReadContext) {
      const { data, error } = await adapter.client
        .from('company_profile')
        .select(
          'legal_name, trading_name, abn, acn, registered_address, registered_state, registered_postcode, public_phone, public_email, public_website, complaints_contact, complaints_email, complaints_phone, privacy_policy_url',
        )
        .maybeSingle();

      if (error) throw error;
      return data ? (data as CompanyProfile) : null;
    },

    /**
     * Not gated. This is the one read a blocked session must be able to make —
     * otherwise the gate is a wall, and a subscriber is asked to acknowledge a
     * Service Statement the app will not show them.
     */
    async activeDocument(
      _ctx: ReadContext,
      docType: ComplianceDocument['docType'],
    ): Promise<ComplianceDocument | null> {
      const { data, error } = await adapter.client
        .from('compliance_documents')
        .select('id, doc_type, title, version, body, effective_from')
        .eq('doc_type', docType)
        .eq('status', 'active')
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return {
        id: data.id,
        docType: data.doc_type as ComplianceDocument['docType'],
        title: data.title,
        version: data.version,
        body: data.body,
        effectiveFrom: data.effective_from,
      };
    },

    async acknowledgements(_ctx: ReadContext) {
      await requireDisclosure(adapter);

      const { data, error } = await adapter.client
        .from('client_disclosures')
        .select('document_version, acknowledged_at')
        .eq('client_user_id', adapter.principal.userId)
        .order('acknowledged_at', { ascending: false });

      if (error) throw error;
      return (data ?? []).map((row) => ({
        documentVersion: row.document_version,
        acknowledgedAt: row.acknowledged_at,
      }));
    },
  };
}

// ============================================================
// Account
// ============================================================

export function createClientAccountRepository(
  adapter: ClientAdapterContext,
): ClientAccountRepository {
  return {
    async subscription(_ctx: ReadContext): Promise<ClientSubscription | null> {
      await requireDisclosure(adapter);

      // Two queries, for the same reason as the library sections above.
      const { data, error } = await adapter.client
        .from('client_accounts')
        .select(
          'display_name, client_type, subscription_status, subscription_started_at, subscription_renews_at',
        )
        .eq('id', adapter.principal.accountId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const { data: seats, error: seatsError } = await adapter.client
        .from('client_users')
        .select('full_name, email, role, status, last_seen_at')
        .eq('account_id', adapter.principal.accountId)
        .order('full_name');

      if (seatsError) throw seatsError;

      return {
        displayName: data.display_name,
        clientType: data.client_type as ClientType,
        status: data.subscription_status as ClientSubscription['status'],
        startedAt: data.subscription_started_at,
        renewsAt: data.subscription_renews_at,
        seats: (seats ?? []).map((seat) => ({
          fullName: seat.full_name,
          email: seat.email,
          role: seat.role as 'primary' | 'member',
          status: seat.status as 'invited' | 'active' | 'disabled',
          lastSeenAt: seat.last_seen_at,
        })),
      };
    },
  };
}
