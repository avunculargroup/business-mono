import { beforeEach, describe, expect, it } from 'vitest';
import {
  expectDescendingBy,
  expectPaginationContract,
  testReadContext,
} from '@platform/data/testing';
import { NotFoundError, type Principal } from '@platform/data';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase';
import { createSupabaseRepositories } from '../bundle';
import type { PlatformSupabaseClient } from '../adapterContext';

const principal: Principal = { kind: 'team', userId: 'director-1' };

let client: FakeSupabaseClient;

function research() {
  return createSupabaseRepositories(client as unknown as PlatformSupabaseClient, principal)
    .research;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'n1',
    title: 'ASIC updates its digital asset guidance',
    url: 'https://example.test/asic',
    canonical_url: null,
    image_url: null,
    source_name: 'Regulator Watch',
    published_at: '2026-08-18T00:00:00Z',
    summary: 'A one-line summary.',
    category: 'regulatory',
    status: 'new',
    relevance_score: 0.8,
    curator_notes: null,
    fetched_at: '2026-08-18T01:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  client = createFakeSupabase();
});

describe('listItems', () => {
  it('satisfies the pagination contract', async () => {
    client.__setRows('news_items', [
      row({ id: 'c', published_at: '2026-08-19T00:00:00Z' }),
      row({ id: 'b', published_at: '2026-08-18T00:00:00Z' }),
      row({ id: 'a', published_at: '2026-08-17T00:00:00Z' }),
    ]);

    await expectPaginationContract((ctx, opts) => research().listItems(ctx, opts), {
      total: 3,
      ctx: testReadContext(),
    });
  });

  it('orders newest first, in the query', async () => {
    client.__setRows('news_items', [
      row({ id: 'c', published_at: '2026-08-19T00:00:00Z' }),
      row({ id: 'b', published_at: '2026-08-18T00:00:00Z' }),
    ]);

    const page = await research().listItems(testReadContext());

    expectDescendingBy(page.items, 'publishedAt');
    const builder = client.__buildersFor('news_items')[0];
    expect(builder.order).toHaveBeenCalledWith('published_at', {
      ascending: false,
      nullsFirst: false,
    });
    // `published_at` is nullable, so `fetched_at` is the tiebreaker that stops
    // undated items floating to arbitrary positions.
    expect(builder.order).toHaveBeenCalledWith('fetched_at', { ascending: false });
  });

  it('excludes archived items in the query, not in the component', async () => {
    client.__setRows('news_items', [row()]);

    await research().listItems(testReadContext());

    expect(client.__buildersFor('news_items')[0].neq).toHaveBeenCalledWith('status', 'archived');
  });

  it('reads 200 rows by default, matching the page it replaces', async () => {
    client.__setRows('news_items', [row()]);

    await research().listItems(testReadContext());

    expect(client.__buildersFor('news_items')[0].range).toHaveBeenCalledWith(0, 199);
  });

  it('asks only for the columns the feed renders', async () => {
    client.__setRows('news_items', [row()]);

    await research().listItems(testReadContext());

    // `body_markdown` holds a whole ingested newsletter. The page this replaces
    // selected `*`, so it pulled 200 of them to render headlines.
    const [columns] = client.__buildersFor('news_items')[0].select.mock.calls[0];
    expect(columns).not.toContain('*');
    expect(columns).not.toContain('body_markdown');
    expect(columns).toContain('curator_notes');
  });

  it('maps a row to the feed read model', async () => {
    client.__setRows('news_items', [
      row({ image_url: 'https://img.test/a.png' }),
    ]);

    const [item] = (await research().listItems(testReadContext())).items;

    expect(item).toEqual({
      id: 'n1',
      title: 'ASIC updates its digital asset guidance',
      url: 'https://example.test/asic',
      imageUrl: 'https://img.test/a.png',
      sourceName: 'Regulator Watch',
      publishedAt: '2026-08-18T00:00:00Z',
      summary: 'A one-line summary.',
      category: 'regulatory',
      status: 'new',
      relevanceScore: 0.8,
      curatorNotes: null,
    });
  });

  it('throws the query error rather than returning an empty feed', async () => {
    client.__setResponse('news_items', { data: null, error: { message: 'boom' } });

    await expect(research().listItems(testReadContext())).rejects.toMatchObject({
      message: 'boom',
    });
  });
});

describe('listTodayDigest', () => {
  it('bounds the day from ctx.asOf, not from the server clock', async () => {
    client.__setRows('news_items', [row()]);

    // Midday in Australia/Sydney on the 19th (UTC+10).
    await research().listTodayDigest(testReadContext(new Date('2026-08-19T02:00:00Z')));

    const builder = client.__buildersFor('news_items')[0];
    const [, from] = builder.gte.mock.calls[0];
    const [, to] = builder.lt.mock.calls[0];

    expect(from).toBe('2026-08-18T14:00:00.000Z'); // 19 Aug 00:00 AEST
    expect(to).toBe('2026-08-19T14:00:00.000Z'); // 20 Aug 00:00 AEST
  });

  it('moves with the anchor, which is what keeps a fixture digest from emptying', async () => {
    client.__setRows('news_items', [row()]);

    await research().listTodayDigest(testReadContext(new Date('2027-01-05T02:00:00Z')));

    const [, from] = client.__buildersFor('news_items')[0].gte.mock.calls[0];
    expect(from).toBe('2027-01-04T13:00:00.000Z'); // 5 Jan 00:00 AEDT (UTC+11)
  });

  it('orders by relevance, then by recency as a tiebreak', async () => {
    client.__setRows('news_items', [row()]);

    await research().listTodayDigest(testReadContext());

    const builder = client.__buildersFor('news_items')[0];
    expect(builder.order).toHaveBeenNthCalledWith(1, 'relevance_score', {
      ascending: false,
      nullsFirst: false,
    });
    expect(builder.order).toHaveBeenNthCalledWith(2, 'published_at', {
      ascending: false,
      nullsFirst: false,
    });
  });

  it('returns the digest read model', async () => {
    client.__setRows('news_items', [row()]);

    const [item] = await research().listTodayDigest(testReadContext());

    expect(item).toEqual({
      id: 'n1',
      title: 'ASIC updates its digital asset guidance',
      url: 'https://example.test/asic',
      category: 'regulatory',
      sourceName: 'Regulator Watch',
      publishedAt: '2026-08-18T00:00:00Z',
      summary: 'A one-line summary.',
    });
  });
});

describe('getItem', () => {
  function detailRow(overrides: Record<string, unknown> = {}) {
    return {
      ...row(),
      source_id: null,
      author: 'A Reporter',
      topic_tags: ['asic', 'custody'],
      body_markdown: '# The article',
      report_id: null,
      ...overrides,
    };
  }

  it('maps the row to the detail read model', async () => {
    client.__setResponse('news_items', { data: detailRow(), error: null });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item).toMatchObject({
      id: 'n1',
      author: 'A Reporter',
      topicTags: ['asic', 'custody'],
      bodyMarkdown: '# The article',
      report: null,
    });
  });

  it('throws NotFoundError rather than returning null', async () => {
    client.__setResponse('news_items', { data: null, error: null });

    await expect(research().getItem(testReadContext(), 'nope')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('prefers the configured source name over the denormalised column', async () => {
    // These two cases came down from the page test: `source_name` is written at
    // ingest and goes stale when a source is renamed.
    client.__setResponse('news_items', {
      data: detailRow({ source_id: 'src-1', source_name: 'Stale name' }),
      error: null,
    });
    client.__setResponse('news_sources', { data: { name: 'Gromen Tree Rings' }, error: null });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.sourceName).toBe('Gromen Tree Rings');
  });

  it('falls back to the row when the item has no configured source', async () => {
    client.__setResponse('news_items', {
      data: detailRow({ source_id: null, source_name: 'Tavily' }),
      error: null,
    });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.sourceName).toBe('Tavily');
    expect(client.__buildersFor('news_sources')).toHaveLength(0);
  });

  it('keeps the page up when the source lookup fails', async () => {
    // The item carries a usable name of its own, so a missing source row is not
    // a reason to fail the whole page.
    client.__setResponse('news_items', {
      data: detailRow({ source_id: 'src-gone', source_name: 'Tavily' }),
      error: null,
    });
    client.__setResponse('news_sources', { data: null, error: { message: 'gone' } });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.sourceName).toBe('Tavily');
  });

  it('does not touch the reports table for an ordinary article', async () => {
    client.__setResponse('news_items', { data: detailRow({ report_id: null }), error: null });

    await research().getItem(testReadContext(), 'n1');

    expect(client.__buildersFor('reports')).toHaveLength(0);
  });
});

describe('the report panel', () => {
  const reportRow = {
    id: 'r1',
    report_type: 'research',
    publisher: 'A Publisher',
    published_at: '2026-08-01T00:00:00Z',
    published_at_source: 'pdf_metadata',
    page_count: 212,
    word_count: 84_000,
    file_format: 'pdf',
    file_size_bytes: 4_100_000,
    content_hash: 'abc123def456ghi789',
    extraction_method: 'pdftotext',
    extraction_quality: 'partial',
    ocr_used: false,
    redistribution: 'internal_only',
    licence_notes: null,
    curator_note: 'Why it matters.',
    storage_path: 'reports/r1.pdf',
    revision_of_report_id: null,
    created_at: '2026-08-02T00:00:00Z',
  };

  function itemWithReport() {
    client.__setResponse('news_items', {
      data: { ...row(), source_id: null, author: null, topic_tags: [], body_markdown: null, report_id: 'r1' },
      error: null,
    });
  }

  it('maps the report to the read model without fetching its body', async () => {
    itemWithReport();
    client.__setResponse('reports', { data: reportRow, error: null });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.report).toEqual({
      id: 'r1',
      reportType: 'research',
      publisher: 'A Publisher',
      publishedAt: '2026-08-01T00:00:00Z',
      publishedAtSource: 'pdf_metadata',
      pageCount: 212,
      wordCount: 84_000,
      fileFormat: 'pdf',
      fileSizeBytes: 4_100_000,
      contentHash: 'abc123def456ghi789',
      extractionMethod: 'pdftotext',
      extractionQuality: 'partial',
      ocrUsed: false,
      redistribution: 'internal_only',
      licenceNotes: null,
      curatorNote: 'Why it matters.',
      storagePath: 'reports/r1.pdf',
      createdAt: '2026-08-02T00:00:00Z',
      isRevision: false,
      supersededItemId: null,
    });

    // `reports.body` is the extracted text of a document that can run to 200
    // pages, and the feed item already carries it.
    const [columns] = client.__buildersFor('reports')[0].select.mock.calls[0];
    expect(columns).not.toContain('body');
  });

  it('resolves the feed item a revision supersedes', async () => {
    itemWithReport();
    // Two reads of `reports`: the report itself, then its predecessor.
    client.__queueResponses('reports', [
      { data: { ...reportRow, revision_of_report_id: 'r0' }, error: null },
      { data: { news_item_id: 'n-old' }, error: null },
    ]);

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.report?.isRevision).toBe(true);
    expect(item.report?.supersededItemId).toBe('n-old');
  });

  it('still flags a revision whose predecessor was never a feed item', async () => {
    // The notice has to appear either way — only the link depends on there
    // being something to link to.
    itemWithReport();
    client.__queueResponses('reports', [
      { data: { ...reportRow, revision_of_report_id: 'r0' }, error: null },
      { data: { news_item_id: null }, error: null },
    ]);

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.report?.isRevision).toBe(true);
    expect(item.report?.supersededItemId).toBeNull();
  });

  it('renders the article without a panel when the report row is unreadable', async () => {
    itemWithReport();
    client.__setResponse('reports', { data: null, error: { message: 'denied' } });

    const item = await research().getItem(testReadContext(), 'n1');

    expect(item.report).toBeNull();
    expect(item.title).toBe('ASIC updates its digital asset guidance');
  });
});

describe('getReportFile', () => {
  it('returns where the artefact is stored', async () => {
    client.__setResponse('reports', {
      data: { storage_path: 'reports/r1.pdf', file_name: 'outlook.pdf' },
      error: null,
    });

    expect(await research().getReportFile('r1')).toEqual({
      storagePath: 'reports/r1.pdf',
      fileName: 'outlook.pdf',
    });
  });

  it('throws NotFoundError for a report that is not there', async () => {
    client.__setResponse('reports', { data: null, error: null });

    await expect(research().getReportFile('r1')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('setReportCuratorNote', () => {
  it('stores the trimmed note', async () => {
    client.__setResponse('reports', { data: null, error: null });

    await research().setReportCuratorNote('r1', '  Why it matters.  ');

    expect(client.__buildersFor('reports')[0].update).toHaveBeenCalledWith({
      curator_note: 'Why it matters.',
    });
  });

  it('clears the note rather than storing an empty string', async () => {
    client.__setResponse('reports', { data: null, error: null });

    await research().setReportCuratorNote('r1', '   ');

    expect(client.__buildersFor('reports')[0].update).toHaveBeenCalledWith({
      curator_note: null,
    });
  });
});

describe('setItemStatus', () => {
  it('writes the status against the id', async () => {
    client.__setResponse('news_items', { data: null, error: null });

    await research().setItemStatus('n1', 'reviewed');

    const builder = client.__buildersFor('news_items')[0];
    expect(builder.update).toHaveBeenCalledWith({ status: 'reviewed' });
    expect(builder.eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('throws so the caller can surface it', async () => {
    client.__setResponse('news_items', { data: null, error: { message: 'nope' } });

    await expect(research().setItemStatus('n1', 'archived')).rejects.toMatchObject({
      message: 'nope',
    });
  });
});

describe('promoteItem', () => {
  beforeEach(() => {
    client.__setResponse('news_items', { data: row(), error: null });
    client.__setResponse('knowledge_items', { data: { id: 'ki-1' }, error: null });
  });

  it('files the article under its own title, read from the row', async () => {
    await research().promoteItem('n1');

    expect(client.__buildersFor('knowledge_items')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'ASIC updates its digital asset guidance',
        source_url: 'https://example.test/asic',
        source_type: 'article',
        topic_tags: ['regulatory'],
      }),
    );
  });

  it('stores the canonical url for an email item whose url opens nothing', async () => {
    client.__setResponse('news_items', {
      data: row({
        url: 'email://gromen/issue-42%40gromen.com',
        canonical_url: 'https://gromen.test/issue-42',
      }),
      error: null,
    });

    await research().promoteItem('n1');

    expect(client.__buildersFor('knowledge_items')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_url: 'https://gromen.test/issue-42' }),
    );
  });

  it('stores no url at all rather than a dead email:// link', async () => {
    client.__setResponse('news_items', {
      data: row({ url: 'email://gromen/issue-42', canonical_url: null }),
      error: null,
    });

    await research().promoteItem('n1');

    expect(client.__buildersFor('knowledge_items')[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({ source_url: null }),
    );
  });

  it('links the item to the knowledge item it created', async () => {
    await research().promoteItem('n1');

    const update = client.__buildersFor('news_items')[1];
    expect(update.update).toHaveBeenCalledWith({
      status: 'promoted',
      knowledge_item_id: 'ki-1',
    });
    expect(update.eq).toHaveBeenCalledWith('id', 'n1');
  });

  it('does not mark the item promoted when the knowledge insert fails', async () => {
    client.__setResponse('knowledge_items', { data: null, error: { message: 'denied' } });

    await expect(research().promoteItem('n1')).rejects.toMatchObject({ message: 'denied' });

    // Only the initial read of news_items should have happened.
    expect(client.__buildersFor('news_items')).toHaveLength(1);
  });
});
