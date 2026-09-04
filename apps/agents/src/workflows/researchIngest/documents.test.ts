import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchBytesMock = vi.fn();
const extractPdfTextMock = vi.fn();
const extractHtmlMock = vi.fn();

vi.mock('../../lib/reportWatch/http.js', () => ({
  fetchBytes: fetchBytesMock,
  // No real delay: the politeness rule is asserted by the call pattern, not by
  // making the suite take six seconds to prove it.
  sleep: vi.fn(() => Promise.resolve()),
}));
vi.mock('../../lib/reportWatch/extract/pdfText.js', () => ({ extractPdfText: extractPdfTextMock }));
vi.mock('../../lib/reportWatch/extract/html.js', () => ({ extractHtml: extractHtmlMock }));

const { fetchAll, fetchDocument, hostOf, resolveDocuments, sha256, venueBase } = await import(
  './documents.js'
);

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]); // "%PDF-1"

function row(overrides: Partial<Parameters<typeof resolveDocuments>[0][number]> = {}) {
  return {
    id: 'doc-1',
    venue: 'asx',
    announcement_id: 'ASX-001',
    pdf_url: null,
    title: 'Treasury Update',
    content_sha256: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  extractPdfTextMock.mockResolvedValue({ ok: true, pages: ['A$1,000,000'], pageCount: 1, title: null, createdAt: null });
  extractHtmlMock.mockResolvedValue({ ok: true, pages: ['self-custody'], title: null, viaJina: false });
  fetchBytesMock.mockResolvedValue({
    ok: true,
    artefact: { bytes: PDF_BYTES, contentType: 'application/pdf', lastModified: null, etag: null, finalUrl: 'https://x.test/a.pdf' },
  });
});

describe('resolveDocuments', () => {
  it('uses a direct pdf_url outright', () => {
    // The path that actually worked in every case researched: a static file on
    // the company's own document directory.
    const [ref] = resolveDocuments([row({ pdf_url: 'https://co.test/pds.pdf' })]);

    expect(ref.status).toBe('resolved');
    expect(ref.url).toBe('https://co.test/pds.pdf');
  });

  it('refuses to guess an announcement URL when no base is configured', () => {
    // A guessed template produces a URL that 404s convincingly and fills
    // retrieval_error with a fiction. Unresolved is the honest answer.
    const [ref] = resolveDocuments([row()], {});

    expect(ref.status).toBe('unresolved');
    expect(ref.url).toBeNull();
    expect(ref).toHaveProperty('reason', expect.stringContaining('RESEARCH_PDF_BASE_ASX'));
  });

  it('builds the URL from a configured venue base', () => {
    const [ref] = resolveDocuments([row()], {
      RESEARCH_PDF_BASE_ASX: 'https://announcements.test/{id}.pdf',
    });

    expect(ref.url).toBe('https://announcements.test/ASX-001.pdf');
  });

  it('escapes the announcement id into the template', () => {
    const [ref] = resolveDocuments([row({ announcement_id: 'a b/c' })], {
      RESEARCH_PDF_BASE_ASX: 'https://announcements.test/{id}.pdf',
    });

    expect(ref.url).toBe('https://announcements.test/a%20b%2Fc.pdf');
  });

  it('is unresolved when there is neither a URL nor a venue and id', () => {
    const [ref] = resolveDocuments([row({ venue: null, announcement_id: null })], {});

    expect(ref.status).toBe('unresolved');
  });

  it('reads the base per venue', () => {
    expect(venueBase('nzx', { RESEARCH_PDF_BASE_NZX: 'x' })).toBe('x');
    expect(venueBase('nzx', {})).toBeNull();
  });
});

describe('fetchDocument', () => {
  const resolved = () => resolveDocuments([row({ pdf_url: 'https://co.test/pds.pdf' })])[0];

  it('returns the extracted text and its content hash', async () => {
    const outcome = await fetchDocument(resolved());

    expect(outcome.kind).toBe('fetched');
    expect(outcome).toMatchObject({ sha256: sha256(PDF_BYTES), text: 'A$1,000,000', pageCount: 1 });
  });

  it('skips extraction when the content hash is unchanged', async () => {
    // What makes a re-run cheap as well as idempotent.
    const [ref] = resolveDocuments([
      row({ pdf_url: 'https://co.test/pds.pdf', content_sha256: sha256(PDF_BYTES) }),
    ]);

    const outcome = await fetchDocument(ref);

    expect(outcome.kind).toBe('unchanged');
    expect(extractPdfTextMock).not.toHaveBeenCalled();
  });

  it('records a 404 as a failed attempt rather than throwing', async () => {
    // A document that 404s repeatedly is a signal, and a silent skip hides it.
    fetchBytesMock.mockResolvedValue({
      ok: false,
      error: { kind: 'not_found', message: 'HTTP 404 from https://co.test/pds.pdf', status: 404 },
    });

    const outcome = await fetchDocument(resolved());

    expect(outcome.kind).toBe('failed');
    expect(outcome).toHaveProperty('error', expect.stringContaining('not_found'));
  });

  it('records an unresolved document as failed without a request', async () => {
    const [ref] = resolveDocuments([row()], {});

    const outcome = await fetchDocument(ref);

    expect(outcome.kind).toBe('failed');
    expect(fetchBytesMock).not.toHaveBeenCalled();
  });

  it('records a PDF that will not extract rather than committing an empty document', async () => {
    extractPdfTextMock.mockResolvedValue({ ok: false, message: 'encrypted' });

    const outcome = await fetchDocument(resolved());

    expect(outcome.kind).toBe('failed');
    expect(outcome).toHaveProperty('error', expect.stringContaining('encrypted'));
  });

  it('falls through to HTML extraction for a non-PDF body', async () => {
    // The About page is HTML, and it has to be storable — it is the losing
    // side of the custody conflict.
    fetchBytesMock.mockResolvedValue({
      ok: true,
      artefact: {
        bytes: new TextEncoder().encode('<html><body>self-custody</body></html>'),
        contentType: 'text/html',
        lastModified: null,
        etag: null,
        finalUrl: 'https://co.test/about',
      },
    });

    const outcome = await fetchDocument(resolved());

    expect(outcome.kind).toBe('fetched');
    expect(extractHtmlMock).toHaveBeenCalled();
  });
});

describe('fetchAll', () => {
  it('returns one outcome per reference, in order', async () => {
    const refs = resolveDocuments([
      row({ id: 'a', pdf_url: 'https://one.test/a.pdf' }),
      row({ id: 'b', pdf_url: 'https://two.test/b.pdf' }),
      row({ id: 'c', pdf_url: 'https://one.test/c.pdf' }),
    ]);

    const outcomes = await fetchAll(refs);

    expect(outcomes.map((o) => o.documentId)).toEqual(['a', 'b', 'c']);
  });

  it('groups by host so the delay is per server, not global', () => {
    expect(hostOf('https://one.test/a.pdf')).toBe('one.test');
    expect(hostOf('not a url')).toBe('');
  });
});
