import { describe, expect, it } from 'vitest';
import { describeClientContract, testReadContext } from '@platform/data/testing';
import type { Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createClientRepositories } from './bundle';
import type { ClientSupabaseClient } from './context';

const principal: Extract<Principal, { kind: 'client' }> = {
  kind: 'client',
  userId: 'client-user-1',
  accountId: 'account-1',
};

const SERVICE_STATEMENT = { version: '2.1' };

const ONCHAIN_ROWS = [
  {
    key: 'btc_price_aud',
    name: 'Bitcoin price (AUD)',
    short_label: 'BTC/AUD',
    unit: 'AUD',
    decimals: 0,
    provider: 'Coin Metrics',
    poll_frequency: 'daily',
    is_active: true,
    is_displayed: true,
    onchain_observations: [
      { value: 168342.5, observed_at: '2026-09-10', is_current: true },
      { value: 167120.0, observed_at: '2026-09-09', is_current: false },
    ],
  },
  {
    key: 'realised_vol_90d',
    name: 'Realised volatility, 90 day',
    short_label: 'RV 90d',
    unit: '%',
    decimals: 1,
    provider: 'Coin Metrics',
    poll_frequency: 'daily',
    is_active: true,
    is_displayed: true,
    onchain_observations: [{ value: 41.27, observed_at: '2026-09-10', is_current: true }],
  },
];

const MACRO_ROWS = [
  {
    id: 'macro-cpi',
    provider_series_code: 'AU_CPI_ANNUAL',
    name: 'Australian CPI, annual',
    short_label: 'CPI',
    unit: '%',
    decimals: 1,
    provider: 'ABS',
    period_granularity: 'quarterly',
    is_active: true,
    indicator_observations: [{ value: 3.2, period_date: '2026-06-30', is_current: true }],
  },
  {
    id: 'macro-cash-rate',
    provider_series_code: 'AU_CASH_RATE',
    name: 'RBA cash rate target',
    short_label: 'Cash rate',
    unit: '%',
    decimals: 2,
    provider: 'RBA',
    period_granularity: 'monthly',
    is_active: true,
    indicator_observations: [{ value: 3.85, period_date: '2026-08-12', is_current: true }],
  },
];

/**
 * A promoted signal and an unpromoted one.
 *
 * The unpromoted row is in the dataset on purpose: assertion 5 is worth nothing
 * against a dataset that contains only rows which should come back.
 */
const SIGNAL_ROWS = [
  {
    id: 'sig-promoted',
    entity_name: 'An exchange',
    product_service_id: 'p1',
    advisor_partner_id: null,
    change_type: 'registration_status',
    title: 'AUSTRAC registration renewed',
    summary: null,
    compliance_class: 'solvency_adjacent',
    client_note: 'The registration was renewed on the date shown.',
    occurred_at: '2026-09-01T00:00:00Z',
    detected_at: '2026-09-01T02:00:00Z',
    external_url: 'https://example.test/austrac',
    source: 'AUSTRAC register',
    payload: { previous_state: 'registered', current_state: 'registered' },
    client_relevant: true,
    client_promoted_by: 'director-1',
  },
  {
    id: 'sig-unpromoted',
    entity_name: 'Another provider',
    product_service_id: 'p2',
    advisor_partner_id: null,
    change_type: 'release',
    title: 'Not cleared for clients',
    summary: null,
    compliance_class: 'neutral',
    client_note: null,
    occurred_at: '2026-09-02T00:00:00Z',
    detected_at: '2026-09-02T02:00:00Z',
    external_url: null,
    source: 'GitHub',
    payload: {},
    client_relevant: false,
    client_promoted_by: null,
  },
];

/**
 * The implementation-fact keys, as the lookup would answer.
 *
 * `operating_metric` is deliberately absent: "funding runway" is how an entity
 * is faring, not how it implemented anything, and outcome facts never reach
 * `/register`.
 */
const IMPLEMENTATION_KEYS = [
  'accounting_treatment',
  'covenants',
  'custody',
  'identity',
  'ledger_event',
  'mandate',
];

const TEMPLATE_ROWS = [
  {
    id: 't-corp',
    slug: 'board-paper-treasury',
    version: '1.0',
    title: 'Board paper',
    artefact_type: 'board_paper',
    client_type: 'corporate',
    regulatory_references: ['AASB 138'],
    facts_required: ['btc_spot_aud'],
    body: '---\nslug: board-paper-treasury\n---\n\n::section id=purpose\nprompt: What decision is sought?\nwhy: Because a paper that names no decision invites one.\nfacts: []\n::\n',
    status: 'active',
  },
  {
    id: 't-smsf',
    slug: 'trustee-minute',
    version: '1.0',
    title: 'Trustee minute',
    artefact_type: 'trustee_minute',
    client_type: 'smsf',
    regulatory_references: ['SIS Reg 4.09'],
    facts_required: [],
    body: '---\nslug: trustee-minute\n---\n\n::section id=matter\nprompt: What matter was considered?\nwhy: Because the minute is the record.\nfacts: []\n::\n',
    status: 'active',
  },
];

/**
 * `clientType` shapes what the templates table returns, because the canned-
 * response fake cannot honour the adapter's own `.in('client_type', …)`.
 *
 * So the fake answers the way Postgres would, and a separate case below
 * asserts the adapter actually issues that filter. Two partial checks where a
 * real RLS session would give one whole one — the same limitation assertion 5
 * carries, recorded in docs/features/client-app/build-progress.md rather than
 * papered over.
 */
function seed(
  client: FakeSupabaseClient,
  acknowledged: boolean,
  clientType: 'corporate' | 'smsf' = 'corporate',
): void {
  client.__setResponse('compliance_documents', { data: SERVICE_STATEMENT, error: null });
  client.__setResponse('client_disclosures', {
    data: acknowledged ? { id: 'ack-1' } : null,
    error: null,
  });

  client.__setResponse('onchain_indicators', { data: ONCHAIN_ROWS, error: null });
  client.__setResponse('economic_indicators', { data: MACRO_ROWS, error: null });
  client.__setResponse('market_reports', { data: null, error: null });
  client.__setResponse('ecosystem_changes', {
    // The adapter's own `.eq('client_relevant', true)` is not honoured by the
    // canned-response fake, so the unpromoted row is handed back here
    // deliberately — that is what makes assertion 5 test the adapter's filter
    // rather than the fake's.
    data: SIGNAL_ROWS.filter((row) => row.client_relevant && row.client_promoted_by),
    error: null,
  });
  client.__setResponse('research_companies', { data: [], error: null });
  client.__setResponse('field_source_minimums', {
    data: IMPLEMENTATION_KEYS.map((field_key) => ({
      field_key,
      client_fact_class: 'implementation',
    })),
    error: null,
  });
  client.__setResponse('products_services', { data: [], error: null });
  client.__setResponse('advisors_partners', { data: [], error: null });
  client.__setResponse('commercial_relationships', { data: [], error: null });
  client.__setResponse('client_library_sections', { data: [], error: null });
  client.__setResponse('client_library_entries', { data: [], error: null });
  client.__setResponse('prepare_templates', {
    data: TEMPLATE_ROWS.filter(
      (row) => row.client_type === 'both' || row.client_type === clientType,
    ),
    error: null,
  });
  client.__setResponse('client_users', { data: { id: principal.userId, account_id: 'account-1' }, error: null });
  client.__setResponse('client_accounts', { data: null, error: null });
  client.__setResponse('company_profile', { data: null, error: null });
}

function context(acknowledged: boolean, clientType: 'corporate' | 'smsf' = 'corporate') {
  const client = createFakeSupabase();
  seed(client, acknowledged, clientType);
  return {
    client,
    ctx: createClientRepositories(client as unknown as ClientSupabaseClient, principal),
  };
}

describeClientContract({
  name: 'supabase',
  createContext: (clientType) => context(true, clientType).ctx,
  createUndisclosedContext: () => context(false).ctx,
  scenario: {
    clearedFactKey: 'btc_spot_aud',
    // In the registry but with no series behind it in this dataset, so it comes
    // back as a stated absence rather than silently vanishing.
    unclearedFactKey: 'btc_spot_usd',
    unpromotedSignalIds: ['sig-unpromoted'],
  },
});

describe('the client adapter beyond the conformance suite', () => {
  const ctx = testReadContext();

  it('filters signals on both promotion columns, not just client_relevant', async () => {
    const { client, ctx: repos } = context(true);
    await repos.signals.list(ctx);

    const builder = client.__buildersFor('ecosystem_changes').at(0)!;
    expect(builder.eq).toHaveBeenCalledWith('client_relevant', true);
    expect(builder.not).toHaveBeenCalledWith('client_promoted_by', 'is', null);
  });

  it('never selects the internal curator note', async () => {
    const { client, ctx: repos } = context(true);
    await repos.signals.list(ctx);

    const builder = client.__buildersFor('ecosystem_changes').at(0)!;
    const selected = builder.select.mock.calls.at(0)?.at(0) as string;

    // curator_note is written for a director and is allowed to editorialise.
    // It only has to escape once, so it is not in the projection at all.
    expect(selected).toContain('client_note');
    expect(selected).not.toContain('curator_note');
  });

  it('serves the client note and not a derived one', async () => {
    const { ctx: repos } = context(true);
    const [signal] = await repos.signals.list(ctx);

    expect(signal!.clientNote).toBe('The registration was renewed on the date shown.');
  });

  it('formats a fact value as a string with the indicator\'s own decimals', async () => {
    const { ctx: repos } = context(true);
    const { facts } = await repos.prepare.resolveFacts(ctx, ['btc_spot_aud']);

    expect(facts).toHaveLength(1);
    expect(facts[0]!.value).toBe('168,343');
    expect(facts[0]!.asAt).toBe('2026-09-10');
    expect(facts[0]!.basis).toBe('observed');
    expect(facts[0]!.complianceClass).toBe('valuation_adjacent');
  });

  it('appends the unit to a percentage rather than leaving it to the caller', async () => {
    const { ctx: repos } = context(true);
    const { facts } = await repos.prepare.resolveFacts(ctx, ['au_cash_rate']);

    expect(facts[0]!.value).toBe('3.85%');
  });

  it('distinguishes an unknown key from a known key with no data', async () => {
    const { ctx: repos } = context(true);
    const { absent } = await repos.prepare.resolveFacts(ctx, [
      'not_in_the_registry',
      'btc_spot_usd',
    ]);

    const byKey = new Map(absent.map((fact) => [fact.key, fact.reason]));
    expect(byKey.get('not_in_the_registry')).toBe('not_cleared');
    expect(byKey.get('btc_spot_usd')).toBe('source_unavailable');
  });

  it('treats an unrecognised compliance class as the most gated one', async () => {
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('ecosystem_changes', {
      data: [{ ...SIGNAL_ROWS[0], compliance_class: 'something_new' }],
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    const [signal] = await repos.signals.list(ctx);

    // Showing a row that should have been gated is the worse failure of the
    // two, so an unknown class falls to solvency_adjacent rather than neutral.
    expect(signal!.complianceClass).toBe('solvency_adjacent');
  });

  it('reads a quiet day from report_mode rather than from an empty findings array', async () => {
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('market_reports', {
      data: {
        id: 'r-1',
        as_of: '2026-09-10',
        report_mode: 'quiet',
        narration_markdown: 'Nothing cleared the materiality floor today.',
        findings: [],
      },
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    const brief = await repos.brief.latest(ctx);

    expect(brief).not.toBeNull();
    expect(brief!.isQuietDay).toBe(true);
    expect(brief!.narration).toContain('Nothing cleared');
  });

  it('does not call a populated brief quiet just because it has no findings', async () => {
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('market_reports', {
      data: {
        id: 'r-2',
        as_of: '2026-09-10',
        report_mode: 'normal',
        narration_markdown: 'Narration.',
        findings: [],
      },
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    expect((await repos.brief.latest(ctx))!.isQuietDay).toBe(false);
  });

  it('recognises an absence signal from its change type', async () => {
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('ecosystem_changes', {
      data: [{ ...SIGNAL_ROWS[0], change_type: 'stale_attestation' }],
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    expect((await repos.signals.list(ctx))[0]!.isAbsenceSignal).toBe(true);
  });

  it('filters templates on the session\'s client type, not in the component', async () => {
    const { client, ctx: repos } = context(true);
    await repos.prepare.templates(ctx, 'corporate');

    const builder = client.__buildersFor('prepare_templates').at(0)!;
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.in).toHaveBeenCalledWith('client_type', ['both', 'corporate']);
  });

  it('serves an smsf session the smsf template and not the corporate one', async () => {
    const { ctx: repos } = context(true, 'smsf');
    const templates = await repos.prepare.templates(ctx, 'smsf');

    expect(templates.map((template) => template.slug)).toEqual(['trustee-minute']);
  });

  it('parses the stored template body into sections', async () => {
    const { ctx: repos } = context(true);
    const [template] = await repos.prepare.templates(ctx, 'corporate');

    expect(template!.sections).toHaveLength(1);
    expect(template!.sections[0]!.prompt).toBe('What decision is sought?');
  });

  it('lets the row win over the body when they disagree on client type', async () => {
    // prepare_templates_client_read filters on the column, so a body claiming
    // 'both' while the column says 'smsf' must not widen who receives it.
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('prepare_templates', {
      data: [{ ...TEMPLATE_ROWS[0], body: '---\nclient_type: both\n---\n' }],
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    const [template] = await repos.prepare.templates(ctx, 'corporate');
    expect(template!.clientType).toBe('corporate');
  });

  it('keeps outcome facts out of a register entry', async () => {
    // "How did they do it" is precedent; "how did it go for them" is
    // performance. Performance figures about named listed securities, served to
    // a paying subscriber, is the one shape this product must not take — so the
    // filter is asserted rather than assumed.
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('research_companies', {
      data: [
        {
          slug: 'an-entity',
          legal_name: 'An Entity Ltd',
          jurisdiction: 'Australia',
          tier: 'tier-1',
          company_listings: [],
          treasury_events: [],
          research_company_facts: [
            {
              field_key: 'custody',
              label: 'Custody',
              value: 'Third-party qualified custodian',
              as_of: '2026-06-30',
              is_superseded: false,
            },
            {
              field_key: 'operating_metric',
              label: 'Funding runway',
              value: '14 months',
              as_of: '2026-06-30',
              is_superseded: false,
            },
          ],
        },
      ],
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    const [entry] = await repos.register.list(ctx);
    const labels = entry!.position.map((fact) => fact.label);

    expect(labels).toContain('Custody');
    expect(labels).not.toContain('Funding runway');
  });

  it('drops a fact whose key nobody has classified yet', async () => {
    // Silent exclusion is the safe direction. A key coined by the research
    // pipeline reaches subscribers when someone classifies it, not before.
    const client = createFakeSupabase();
    seed(client, true);
    client.__setResponse('research_companies', {
      data: [
        {
          slug: 'an-entity',
          legal_name: 'An Entity Ltd',
          jurisdiction: 'Australia',
          tier: 'tier-1',
          company_listings: [],
          treasury_events: [],
          research_company_facts: [
            {
              field_key: 'unrealised_gain',
              label: 'Unrealised gain',
              value: '$4.1m',
              as_of: '2026-06-30',
              is_superseded: false,
            },
          ],
        },
      ],
      error: null,
    });
    const repos = createClientRepositories(client as unknown as ClientSupabaseClient, principal);

    expect((await repos.register.list(ctx))[0]!.position).toEqual([]);
  });

  it('asks the lookup for implementation keys only', async () => {
    const { client, ctx: repos } = context(true);
    await repos.register.list(ctx);

    const builder = client.__buildersFor('field_source_minimums').at(0)!;
    expect(builder.eq).toHaveBeenCalledWith('client_fact_class', 'implementation');
  });

  it('asks the disclosure question once per bundle however many surfaces read', async () => {
    const { client, ctx: repos } = context(true);

    await Promise.all([
      repos.signals.list(ctx),
      repos.brief.latest(ctx),
      repos.indicators.available(ctx),
    ]);

    // One request, not three. A dashboard touching a dozen surfaces should not
    // ask a dozen times.
    expect(client.__buildersFor('compliance_documents')).toHaveLength(1);
  });
});
