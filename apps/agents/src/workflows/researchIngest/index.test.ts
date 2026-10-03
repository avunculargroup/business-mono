import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The workflow's own behaviour, with the network, the models and the database
 * mocked. What is asserted here is the wiring that the unit-tested pieces
 * cannot see: that a rejected figure never reaches persist, that a quiet run
 * does not call the scorer, that a failed fetch is recorded rather than thrown,
 * and that the gate suspends on promotion and not on ingest.
 */

const rexGenerate = vi.fn();
const lexGenerate = vi.fn();
const rpcMock = vi.fn();
const fetchAllMock = vi.fn();
const embedTextsMock = vi.fn();
const tables = new Map<string, unknown[]>();
const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
const upserts: Array<{ table: string; values: unknown; options: unknown }> = [];

vi.mock('../../agents/researcher/index.js', () => ({ rex: { generate: rexGenerate } }));
vi.mock('../../agents/compliance/index.js', () => ({ lex: { generate: lexGenerate } }));
vi.mock('../../config/model.js', () => ({ stepRequestContext: vi.fn((key: string) => ({ key })) }));
vi.mock('./documents.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./documents.js')>()),
  fetchAll: fetchAllMock,
}));
vi.mock('../../lib/contentEmbeddings.js', () => ({
  chunkText: (text: string) => (text ? [text] : []),
  embedTexts: embedTextsMock,
}));

function builder(table: string) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = vi.fn(self);
  }
  chain['upsert'] = vi.fn((values: unknown, options: unknown) => {
    upserts.push({ table, values, options });
    return chain;
  });
  chain['update'] = vi.fn((values: Record<string, unknown>) => {
    updates.push({ table, values });
    return chain;
  });
  chain['maybeSingle'] = vi.fn(() =>
    Promise.resolve({ data: (tables.get(table) ?? [])[0] ?? null, error: null }),
  );
  chain['then'] = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: tables.get(table) ?? [], error: null }).then(onFulfilled);
  return chain;
}

vi.mock('@platform/db', () => ({
  supabase: {
    from: vi.fn((table: string) => builder(table)),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

const { approvalGateStep, researchIngestWorkflow } = await import('./index.js');

const COMPANY = '00000000-0000-4000-8000-000000000001';

/** The announcement line the first-acquisition row is read from. */
const ANNOUNCEMENT_TEXT =
  'The Company has acquired 6.08914 bitcoin for A$1,000,000, inclusive of fees and expenses.';

const ACQUISITION = {
  event_type: 'acquisition',
  asset_class: 'btc',
  event_date: '2025-06-04',
  quantity: 6.08914,
  consideration_native: 1000000,
  native_currency: 'AUD',
  fees_included: true,
  headline: 'First acquisition',
  detail: 'Inclusive of fees and expenses.',
  disclosure_venue: 'asx',
  basis: 'direct_spot',
  source_document_id: 'doc-1',
};

/** What the extract step computes for it, from the record's slug. */
const ACQUISITION_KEY = 'locate-technologies:acq:2025-06-04';

async function run(input: Record<string, unknown> = {}) {
  const instance = await researchIngestWorkflow.createRun();
  return instance.start({
    inputData: { companyId: COMPANY, promoteToPublished: false, requestedBy: null, ...input },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  tables.clear();
  updates.length = 0;
  upserts.length = 0;

  tables.set('research_documents', [
    {
      id: 'doc-1',
      venue: 'asx',
      announcement_id: 'ASX-001',
      pdf_url: 'https://co.test/treasury.pdf',
      title: 'Treasury Update',
      content_sha256: null,
      source_class: 'exchange_announcement',
    },
  ]);
  tables.set('treasury_events', []);
  // The ledger's accepted set, as 20261001030000 seeds it.
  tables.set(
    'field_source_classes',
    ['regulated_disclosure', 'exchange_announcement', 'audited_accounts', 'filed_financials'].map(
      (source_class) => ({ source_class }),
    ),
  );
  tables.set('research_document_sections', []);
  tables.set('research_companies', [
    { slug: 'locate-technologies', legal_name: 'Locate Technologies Limited' },
  ]);

  fetchAllMock.mockResolvedValue([
    { kind: 'fetched', documentId: 'doc-1', sha256: 'abc123', text: ANNOUNCEMENT_TEXT, pageCount: 1 },
  ]);
  embedTextsMock.mockResolvedValue([[0.1, 0.2]]);
  // One agent, two steps, two shapes. The scope key is what tells them apart —
  // which is also what makes them separately configurable in /settings/models.
  rexGenerate.mockImplementation((_messages: unknown, opts: { requestContext: { key: string } }) =>
    Promise.resolve(
      opts.requestContext.key === 'researchIngest.score'
        ? { object: { findings: [] } }
        : { object: { events: [ACQUISITION], notes: null } },
    ),
  );
  lexGenerate.mockResolvedValue({
    object: {
      classifications: [
        {
          event_natural_key: ACQUISITION_KEY,
          field_key: 'ledger_event',
          classification: 'publishable',
          reason: 'A disclosed fact with a citation.',
        },
      ],
    },
  });
  rpcMock.mockResolvedValue({
    data: {
      events: { inserted: 1, updated: 0 },
      snapshots: { inserted: 0, updated: 0 },
      findings: { inserted: 1, updated: 0 },
      classifications: { inserted: 1, updated: 0 },
    },
    error: null,
  });
});

describe('the happy path', () => {
  it('commits a validated event and reports what it did', async () => {
    const result = await run();

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.result).toMatchObject({
      companyId: COMPANY,
      documentsFetched: 1,
      eventsCommitted: 1,
      rejectedClaims: 0,
      quiet: false,
      published: false,
    });
  });

  it('persists through the single-transaction RPC rather than table by table', async () => {
    // Four sequential inserts can half-succeed, leaving events committed with
    // the classifications that gate them missing.
    await run();

    expect(rpcMock).toHaveBeenCalledWith('commit_research_ingest', expect.anything());
    const [, args] = rpcMock.mock.calls[0];
    expect((args as { payload: { events: unknown[] } }).payload.events).toHaveLength(1);
  });

  it('attributes every candidate to the document actually read', async () => {
    // A model that names a different filing has produced provenance nobody can
    // check, so its own answer is overwritten.
    rexGenerate.mockResolvedValue({
      object: { events: [{ ...ACQUISITION, source_document_id: 'a-document-it-invented' }], notes: null },
    });

    await run();

    const [, args] = rpcMock.mock.calls[0];
    const [event] = (args as { payload: { events: Array<{ source_document_id: string }> } }).payload.events;
    expect(event.source_document_id).toBe('doc-1');
  });

  it('keys each event from the record, ignoring any key the model offers', async () => {
    // Prefix drift: a model-written key varies between runs, and a key that
    // varies reconciles as new and duplicates the row.
    rexGenerate.mockResolvedValue({
      object: { events: [{ ...ACQUISITION, natural_key: 'loc:acquisition:2025-06-04' }], notes: null },
    });

    await run();

    const [, args] = rpcMock.mock.calls[0];
    const [event] = (args as { payload: { events: Array<{ natural_key: string }> } }).payload.events;
    expect(event.natural_key).toBe(ACQUISITION_KEY);
  });

  it('drops a candidate whose date cannot be stored, and commits the rest', async () => {
    // An unparseable date fails the DATE cast inside the commit transaction and
    // would take every other row in the run down with it.
    rexGenerate.mockResolvedValue({
      object: { events: [ACQUISITION, { ...ACQUISITION, event_date: 'June 29, 2026' }], notes: null },
    });

    await run();

    const [, args] = rpcMock.mock.calls[0];
    expect((args as { payload: { events: unknown[] } }).payload.events).toHaveLength(1);
  });
});

describe('what the extractor reads', () => {
  const EIGHT_K = [
    'FORM 8-K',
    '',
    '**Item 7.01 Regulation FD Disclosure.**',
    '',
    'The presentation states BTC Yield of 12.5% for the period.',
    '',
    '**Item 8.01 Other Events.**',
    '',
    'The Company has acquired 6.08914 bitcoin for A$1,000,000, inclusive of fees and expenses.',
    '',
    'SIGNATURES',
  ].join('\n');

  function secFiling() {
    tables.set('research_documents', [
      {
        id: 'doc-1',
        venue: 'sec',
        announcement_id: '0001',
        pdf_url: 'https://www.sec.gov/Archives/edgar/data/1/0001/filing.htm',
        title: 'Form 8-K — weekly update',
        content_sha256: null,
        source_class: 'exchange_announcement',
      },
    ]);
    // As the table reads back after the upsert.
    tables.set('research_document_sections', [
      { id: 'sec-701', filing_item: '8-K Item 7.01', source_class: 'furnished_release' },
      { id: 'sec-801', filing_item: '8-K Item 8.01', source_class: 'exchange_announcement' },
    ]);
    fetchAllMock.mockResolvedValue([
      { kind: 'fetched', documentId: 'doc-1', sha256: 'abc', text: EIGHT_K, pageCount: null },
    ]);
  }

  it('reads only the filed item of an 8-K, and cites it on the event', async () => {
    secFiling();

    await run();

    // One extraction call for Item 8.01; the furnished Item 7.01 is not read.
    const extractCalls = rexGenerate.mock.calls.filter(
      ([, opts]) => (opts as { requestContext: { key: string } }).requestContext.key ===
        'researchIngest.extract_events',
    );
    expect(extractCalls).toHaveLength(1);
    const [[messages]] = extractCalls as unknown as Array<[Array<{ content: string }>]>;
    expect(messages[0].content).toContain('Filing item: 8-K Item 8.01');
    expect(messages[0].content).not.toContain('BTC Yield');

    const [, args] = rpcMock.mock.calls[0];
    const [event] = (args as { payload: { events: Array<{ source_section_id: string | null }> } })
      .payload.events;
    expect(event.source_section_id).toBe('sec-801');
  });

  it('stores each item as a section, leaving any it already holds alone', async () => {
    secFiling();

    await run();

    const sectionUpserts = upserts.filter((u) => u.table === 'research_document_sections');

    expect(sectionUpserts).toHaveLength(1);
    const { values, options } = sectionUpserts[0];
    const rows = values as Array<{ filing_item: string; source_class: string }>;
    expect(rows.map((row) => [row.filing_item, row.source_class])).toEqual([
      ['8-K Item 7.01', 'furnished_release'],
      ['8-K Item 8.01', 'exchange_announcement'],
    ]);
    expect(options).toEqual({ onConflict: 'document_id,filing_item', ignoreDuplicates: true });
  });

  it('never reads a source the ledger refuses', async () => {
    // A news article in the company's documents. Extracting from it would
    // put an event in front of the gate, which raises and fails the commit.
    tables.set('research_documents', [
      {
        id: 'doc-1',
        venue: 'web',
        announcement_id: null,
        pdf_url: 'https://news.test/article',
        title: 'News report',
        content_sha256: null,
        source_class: 'secondary',
      },
    ]);

    const result = await run();

    expect(result.status).toBe('success');
    expect(rexGenerate).not.toHaveBeenCalled();
  });

  it('refuses to run with no accepted set to judge by', async () => {
    // Fail closed: an empty set would mean reading nothing and reporting a
    // quiet run, which is indistinguishable from a quiet week.
    tables.set('field_source_classes', []);

    const result = await run();

    expect(result.status).toBe('failed');
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe('the numeric gate', () => {
  it('holds back an event whose figure is not in the source', async () => {
    // 6.089 where the document says 6.08914: a plausible sentence and a wrong
    // ledger. The whole event is held, not just the field — an event with one
    // figure silently dropped renders as a purchase with no consideration.
    rexGenerate.mockResolvedValue({
      object: { events: [{ ...ACQUISITION, quantity: 6.089 }], notes: null },
    });

    const result = await run();

    expect(result.status === 'success' && result.result.rejectedClaims).toBe(1);
    const [, args] = rpcMock.mock.calls[0];
    expect((args as { payload: { events: unknown[] } }).payload.events).toHaveLength(0);
  });

  it('keeps the events that validate when one of a batch is rejected', async () => {
    // A rejection must not abort the run: the remaining events still commit.
    rexGenerate.mockResolvedValue({
      object: {
        events: [
          ACQUISITION,
          { ...ACQUISITION, quantity: 99 },
        ],
        notes: null,
      },
    });

    const result = await run();

    const [, args] = rpcMock.mock.calls[0];
    expect((args as { payload: { events: unknown[] } }).payload.events).toHaveLength(1);
    expect(result.status === 'success' && result.result.rejectedClaims).toBe(1);
  });
});

describe('the quiet-day path', () => {
  it('does not call the scorer when nothing changed', async () => {
    // Re-ingesting the same document. Calling the model anyway would produce a
    // finding about nothing, which is how a feed teaches its reader to ignore it.
    tables.set('treasury_events', [
      { natural_key: ACQUISITION_KEY, quantity: 6.08914, consideration_native: 1000000 },
    ]);

    const result = await run();

    expect(result.status === 'success' && result.result.quiet).toBe(true);
    // One call for extraction, none for scoring.
    expect(rexGenerate).toHaveBeenCalledTimes(1);
  });

  it('reports a company with no documents as quiet rather than failing', async () => {
    tables.set('research_documents', []);
    fetchAllMock.mockResolvedValue([]);

    const result = await run();

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.result.quiet).toBe(true);
  });
});

describe('failed retrieval', () => {
  it('records the error on the document instead of throwing', async () => {
    // A document that 404s repeatedly is a signal, and a silent skip hides it.
    fetchAllMock.mockResolvedValue([
      { kind: 'failed', documentId: 'doc-1', error: 'not_found: HTTP 404', resolution: 'fetch_failed' },
    ]);

    const result = await run();

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.result.documentsFailed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'research_documents',
        values: expect.objectContaining({
          retrieval_error: 'not_found: HTTP 404',
          resolution_status: 'fetch_failed',
        }),
      }),
    );
  });

  it('records a document with no URL as never attempted, not as a failed fetch', async () => {
    fetchAllMock.mockResolvedValue([
      { kind: 'failed', documentId: 'doc-1', error: 'unresolved: no pdf_url', resolution: 'no_url' },
    ]);

    await run();

    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'research_documents',
        values: expect.objectContaining({ resolution_status: 'no_url' }),
      }),
    );
  });
});

describe('the approval gate', () => {
  it('runs straight through on ingest', async () => {
    // Ingest is unattended. A pipeline that stops for approval on every
    // quarterly stops running.
    const result = await run();

    expect(result.status).toBe('success');
  });

  it('suspends when the run proposes the record for publication', async () => {
    const result = await run({ promoteToPublished: true });

    expect(result.status).toBe('suspended');
  });

  // Resuming through the engine needs a storage-backed Mastra instance, which
  // this suite deliberately does not build. The two resume branches are a
  // property of the step, so they are exercised on the step.
  const gateInput = {
    companyId: COMPANY,
    promoteToPublished: true,
    requestedBy: null,
    fetch: { fetched: 1, unchanged: 0, failed: 0, documents: [] },
    validated: [],
    rejected: [],
    created: [],
    deltas: [],
    quiet: false,
    findings: [],
    classifications: [],
    committed: { events: { inserted: 1, updated: 0 } },
  };

  it('moves the record out of draft only after a director approves', async () => {
    await approvalGateStep.execute({
      inputData: gateInput,
      resumeData: { approved: true, approvedBy: '2fcaea14-6d37-4def-b56d-467d61c92f36' },
      suspend: vi.fn(),
    } as never);

    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'research_companies',
        values: expect.objectContaining({
          review_state: 'internal',
          reviewed_by: '2fcaea14-6d37-4def-b56d-467d61c92f36',
        }),
      }),
    );
    // Approval is review, never clearance: a subscriber sees nothing yet.
    expect(updates).not.toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ client_cleared: true }) }),
    );
  });

  it('leaves the record in draft when the director rejects', async () => {
    const result = (await approvalGateStep.execute({
      inputData: gateInput,
      resumeData: { approved: false, approvedBy: null },
      suspend: vi.fn(),
    } as never)) as { published: boolean };

    expect(result.published).toBe(false);
    expect(updates).not.toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ review_state: 'internal' }) }),
    );
  });
});

describe('compliance defaults', () => {
  it('classifies nothing rather than guessing when Lex fails', async () => {
    // An unclassified field is internal in the view, so a Lex outage cannot
    // publish anything. The safe direction is the default.
    lexGenerate.mockResolvedValue({ object: null });

    await run();

    const [, args] = rpcMock.mock.calls[0];
    expect((args as { payload: { classifications: unknown[] } }).payload.classifications).toEqual([]);
  });
});
