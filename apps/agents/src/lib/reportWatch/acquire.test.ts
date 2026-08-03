import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient & { storage: { from: ReturnType<typeof vi.fn> } };
const uploadMock = vi.fn(async () => ({ error: null }));

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const { acquireCandidate, storagePathFor, sourceSlug } = await import('./acquire.js');

const NOW = new Date('2026-08-03T00:00:00Z');

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x41]);

/** robots that says yes to everything, with no crawl delay. */
const permissiveRobots = {
  isAllowed: async () => true,
  crawlDelay: () => null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

interface Response {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  bytes?: Uint8Array;
  url?: string;
}

/** Route responses by (method, url-substring), in declaration order. */
function routeFetch(routes: Array<{ match: string; method?: string; res: Response }>) {
  return vi.fn(async (url: string, init?: { method?: string }) => {
    const method = init?.method ?? 'GET';
    const route = routes.find(
      (r) => String(url).includes(r.match) && (r.method ?? 'GET') === method,
    );
    const res = route?.res ?? { ok: false, status: 404 };
    const bytes = res.bytes ?? new Uint8Array();
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      url: res.url ?? String(url),
      headers: new Headers(res.headers ?? {}),
      text: async () => res.body ?? '',
      arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  }) as unknown as typeof fetch;
}

const input = (over: Record<string, unknown> = {}) => ({
  candidateId: 'c1',
  url: 'https://river.com/files/adoption-2026.pdf',
  landingUrl: null,
  sourceId: 's1',
  sourceName: 'River Financial',
  crawlDelaySeconds: 0,
  pdfLinkSelector: undefined,
  ...over,
});

beforeEach(() => {
  uploadMock.mockClear();
  uploadMock.mockResolvedValue({ error: null });
  const base = createFakeSupabase();
  fakeSupabase = Object.assign(base, {
    storage: { from: vi.fn(() => ({ upload: uploadMock })) },
  });
});

describe('storagePathFor', () => {
  it('keys the path by content hash so it is inherently immutable', () => {
    expect(storagePathFor('River Financial', 'abc123', 'pdf', NOW)).toBe(
      'river-financial/2026/abc123.pdf',
    );
  });

  it('slugifies awkward source names and never yields an empty segment', () => {
    expect(sourceSlug('ASIC / AUSTRAC — publications')).toBe('asic-austrac-publications');
    expect(sourceSlug('!!!')).toBe('source');
  });
});

describe('acquireCandidate', () => {
  it('downloads, hashes and uploads a PDF', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        { match: 'adoption-2026.pdf', method: 'HEAD', res: { headers: { 'content-type': 'application/pdf', 'content-length': '10', etag: 'W/"abc"' } } },
        { match: 'adoption-2026.pdf', res: { headers: { 'content-type': 'application/pdf' }, bytes: PDF_BYTES } },
      ]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);

    expect(result.outcome).toBe('acquired');
    if (result.outcome !== 'acquired') return;
    expect(result.artefact.fileFormat).toBe('pdf');
    expect(result.artefact.fileName).toBe('adoption-2026.pdf');
    expect(result.artefact.storagePath).toBe(
      `river-financial/2026/${result.artefact.contentHash}.pdf`,
    );
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it('skips a robots-disallowed URL without a single request', async () => {
    const fetchSpy = routeFetch([]);
    vi.stubGlobal('fetch', fetchSpy);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const denying = { isAllowed: async () => false, crawlDelay: () => null } as any;

    const result = await acquireCandidate(input(), denying, NOW);

    expect(result).toMatchObject({ outcome: 'skipped', reason: 'robots_disallowed' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an oversized artefact on HEAD alone, before downloading', async () => {
    const fetchSpy = routeFetch([
      { match: '.pdf', method: 'HEAD', res: { headers: { 'content-type': 'application/pdf', 'content-length': '900000000' } } },
    ]);
    vi.stubGlobal('fetch', fetchSpy);

    const result = await acquireCandidate(input(), permissiveRobots, NOW);

    expect(result).toMatchObject({ outcome: 'skipped', reason: 'too_large' });
    // One HEAD, no GET — the whole point of checking size first.
    expect(fetchSpy).toHaveBeenCalledOnce();
  });

  it('skips a wrong content type declared at HEAD', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([{ match: '.pdf', method: 'HEAD', res: { headers: { 'content-type': 'video/mp4' } } }]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);
    expect(result).toMatchObject({ outcome: 'skipped', reason: 'wrong_content_type' });
  });

  it('accepts an octet-stream body that carries the PDF magic number', async () => {
    // Plenty of CDNs serve PDFs as octet-stream; rejecting on the header alone
    // would lose real reports.
    vi.stubGlobal(
      'fetch',
      routeFetch([
        { match: '.pdf', method: 'HEAD', res: { headers: { 'content-type': 'application/octet-stream' } } },
        { match: '.pdf', res: { headers: { 'content-type': 'application/octet-stream' }, bytes: PDF_BYTES } },
      ]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);
    expect(result.outcome).toBe('acquired');
    if (result.outcome !== 'acquired') return;
    expect(result.artefact.fileFormat).toBe('pdf');
  });

  it('proceeds past a 405 on HEAD rather than treating it as a rejection', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        { match: '.pdf', method: 'HEAD', res: { ok: false, status: 405 } },
        { match: '.pdf', res: { headers: { 'content-type': 'application/pdf' }, bytes: PDF_BYTES } },
      ]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);
    expect(result.outcome).toBe('acquired');
  });

  it('ends the branch as a duplicate when the hash is already held', async () => {
    fakeSupabase.__setResponse('reports', { data: { id: 'r-existing' }, error: null });
    vi.stubGlobal(
      'fetch',
      routeFetch([
        { match: '.pdf', method: 'HEAD', res: { headers: { 'content-type': 'application/pdf' } } },
        { match: '.pdf', res: { headers: { 'content-type': 'application/pdf' }, bytes: PDF_BYTES } },
      ]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);

    expect(result).toMatchObject({ outcome: 'duplicate', reportId: 'r-existing' });
    // The publisher moved a PDF we already hold — no upload, no extraction.
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('follows exactly one hop to the artefact and records the landing page', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        {
          match: '/reports/mining-q2',
          res: {
            body: '<html><body><a href="/files/mining-q2.pdf">Download</a></body></html>',
            url: 'https://river.com/reports/mining-q2',
          },
        },
        { match: 'mining-q2.pdf', method: 'HEAD', res: { headers: { 'content-type': 'application/pdf' } } },
        { match: 'mining-q2.pdf', res: { headers: { 'content-type': 'application/pdf' }, bytes: PDF_BYTES } },
      ]),
    );

    const result = await acquireCandidate(
      input({
        url: 'https://river.com/reports/mining-q2',
        landingUrl: 'https://river.com/reports/mining-q2',
      }),
      permissiveRobots,
      NOW,
    );

    expect(result.outcome).toBe('acquired');
    if (result.outcome !== 'acquired') return;
    expect(result.artefact.url).toContain('mining-q2.pdf');
    expect(result.artefact.canonicalUrl).toBe('https://river.com/reports/mining-q2');
  });

  it('treats the landing page itself as the artefact when the hop finds no PDF', async () => {
    vi.stubGlobal(
      'fetch',
      routeFetch([
        {
          match: '/reports/note',
          method: 'HEAD',
          res: { headers: { 'content-type': 'text/html' } },
        },
        {
          match: '/reports/note',
          res: { headers: { 'content-type': 'text/html; charset=utf-8' }, body: '<html><body><h1>A research note</h1></body></html>' },
        },
      ]),
    );

    const result = await acquireCandidate(
      input({ url: 'https://river.com/reports/note', landingUrl: 'https://river.com/reports/note' }),
      permissiveRobots,
      NOW,
    );

    // An HTML research note is a perfectly good report.
    expect(result.outcome).toBe('acquired');
    if (result.outcome !== 'acquired') return;
    expect(result.artefact.fileFormat).toBe('html');
  });

  it('reports a transport failure as failed, not skipped', async () => {
    // Transient until proven otherwise — the caller owns the retry budget.
    vi.stubGlobal(
      'fetch',
      routeFetch([{ match: '.pdf', method: 'HEAD', res: { ok: false, status: 503 } }]),
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);
    expect(result.outcome).toBe('failed');
  });

  it('never throws across the seam', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('TLS handshake failed');
      }) as unknown as typeof fetch,
    );

    const result = await acquireCandidate(input(), permissiveRobots, NOW);
    expect(result.outcome).toBe('failed');
  });
});
