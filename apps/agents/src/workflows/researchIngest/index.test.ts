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
  for (const method of ['select', 'eq', 'order', 'limit', 'upsert']) {
    chain[method] = vi.fn(self);
  }
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
  natural_key: 'loc:acq:2025-06-04',
};

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
  tables.set('research_companies', [{ legal_name: 'Locate Technologies Limited' }]);

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
          event_natural_key: 'loc:acq:2025-06-04',
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
          { ...ACQUISITION, quantity: 99, natural_key: 'loc:acq:invented' },
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
      { natural_key: 'loc:acq:2025-06-04', quantity: 6.08914, consideration_native: 1000000 },
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
      { kind: 'failed', documentId: 'doc-1', error: 'not_found: HTTP 404' },
    ]);

    const result = await run();

    expect(result.status).toBe('success');
    expect(result.status === 'success' && result.result.documentsFailed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'research_documents',
        values: expect.objectContaining({ retrieval_error: 'not_found: HTTP 404' }),
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

  it('publishes only after a director approves', async () => {
    await approvalGateStep.execute({
      inputData: gateInput,
      resumeData: { approved: true, approvedBy: null },
      suspend: vi.fn(),
    } as never);

    expect(updates).toContainEqual(
      expect.objectContaining({
        table: 'research_companies',
        values: expect.objectContaining({ is_published: true }),
      }),
    );
  });

  it('leaves the record unpublished when the director rejects', async () => {
    const result = (await approvalGateStep.execute({
      inputData: gateInput,
      resumeData: { approved: false, approvedBy: null },
      suspend: vi.fn(),
    } as never)) as { published: boolean };

    expect(result.published).toBe(false);
    expect(updates).not.toContainEqual(
      expect.objectContaining({ values: expect.objectContaining({ is_published: true }) }),
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
