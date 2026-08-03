import { describe, it, expect, vi, beforeEach } from 'vitest';

const extractTextMock = vi.fn();
const getMetaMock = vi.fn();
vi.mock('unpdf', () => ({
  extractText: (...args: unknown[]) => extractTextMock(...args),
  getMeta: (...args: unknown[]) => getMetaMock(...args),
}));

const ocrPdfMock = vi.fn();
vi.mock('./ocr.js', async () => {
  const actual = await vi.importActual<typeof import('./ocr.js')>('./ocr.js');
  return { ...actual, ocrPdf: (...args: unknown[]) => ocrPdfMock(...args) };
});

const { extractReport, joinPages } = await import('./index.js');
const { parsePdfDate } = await import('./pdfText.js');

const goodPage = 'Bitcoin adoption among Australian corporates continued to broaden. '.repeat(4);
const scannedPage = 'fi fl ';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const input = (over: Record<string, unknown> = {}) => ({
  bytes: PDF_BYTES,
  fileFormat: 'pdf' as const,
  fileName: 'report.pdf',
  url: 'https://river.com/files/report.pdf',
  ocrEnabled: false,
  ocrPageLimit: 40,
  ...over,
});

beforeEach(() => {
  extractTextMock.mockReset();
  getMetaMock.mockReset();
  ocrPdfMock.mockReset();
  getMetaMock.mockResolvedValue({ info: {}, metadata: null });
});

describe('parsePdfDate', () => {
  it('reads the PDF D: format', () => {
    expect(parsePdfDate("D:20260715093000+10'00'")).toBe('2026-07-15');
  });

  it('accepts a Date and rejects nonsense rather than inventing a date', () => {
    expect(parsePdfDate(new Date('2026-07-15T00:00:00Z'))).toBe('2026-07-15');
    expect(parsePdfDate('D:00000000')).toBeNull();
    expect(parsePdfDate(undefined)).toBeNull();
  });
});

describe('joinPages', () => {
  it('marks page boundaries for PDFs and leaves HTML unmarked', () => {
    expect(joinPages(['a', 'b'], 'pdf')).toContain('**p. 2**');
    expect(joinPages(['a', 'b'], 'html')).toBe('a\n\nb');
  });
});

describe('extractReport — PDF', () => {
  it('stops at the text layer when quality is good, never calling OCR', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 2, text: [goodPage, goodPage] });
    getMetaMock.mockResolvedValue({
      info: { Title: 'Bitcoin Adoption 2026', CreationDate: 'D:20260715000000Z' },
      metadata: null,
    });

    const out = await extractReport(input({ ocrEnabled: true }));

    expect(out.quality).toBe('good');
    expect(out.method).toBe('pdf_text_layer');
    expect(out.ocrUsed).toBe(false);
    expect(out.titleHint).toBe('Bitcoin Adoption 2026');
    expect(out.publishedAtHint).toBe('2026-07-15');
    // The cheap deterministic path won — paying a vendor here would buy a worse
    // answer.
    expect(ocrPdfMock).not.toHaveBeenCalled();
  });

  it('does not call OCR when the source has not opted in, even on a bad scan', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 2, text: [scannedPage, scannedPage] });

    const out = await extractReport(input({ ocrEnabled: false }));

    expect(out.quality).toBe('failed');
    expect(ocrPdfMock).not.toHaveBeenCalled();
    // A failed extraction still yields a stored artefact and a feed item — a
    // report BTS knows exists but cannot read beats one it never noticed.
    expect(out.error).toBeNull();
  });

  it('merges OCR page-for-page, keeping the good pages the text layer read', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 3, text: [goodPage, scannedPage, goodPage] });
    ocrPdfMock.mockResolvedValue({
      ok: true,
      pages: ['ocr page one', `${goodPage}OCR RECOVERED`, 'ocr page three'],
      ocrPages: 3,
      truncated: false,
    });

    const out = await extractReport(input({ ocrEnabled: true }));

    expect(ocrPdfMock).toHaveBeenCalledOnce();
    expect(out.method).toBe('ocr');
    expect(out.ocrUsed).toBe(true);
    // Page 0 and 2 were fine — they keep their original, better text.
    expect(out.pages[0]).toBe(goodPage.trim());
    expect(out.pages[1]).toContain('OCR RECOVERED');
    expect(out.pages[2]).toBe(goodPage.trim());
    expect(out.quality).toBe('good');
    expect(out.metrics.ocr_pages).toBe(1);
  });

  it('keeps the text layer when OCR fails rather than losing the report', async () => {
    extractTextMock.mockResolvedValue({ totalPages: 2, text: [goodPage, scannedPage] });
    ocrPdfMock.mockResolvedValue({ ok: false, message: 'LLAMA_CLOUD_API_KEY is not configured' });

    const out = await extractReport(input({ ocrEnabled: true }));

    expect(out.method).toBe('pdf_text_layer');
    expect(out.ocrUsed).toBe(false);
    expect(out.quality).toBe('partial');
    expect(out.pages).toHaveLength(2);
  });

  it('falls through to OCR-only when the text layer will not open at all', async () => {
    extractTextMock.mockRejectedValue(new Error('Invalid PDF structure'));
    ocrPdfMock.mockResolvedValue({ ok: true, pages: [goodPage, goodPage], ocrPages: 2, truncated: false });

    const out = await extractReport(input({ ocrEnabled: true }));

    expect(out.method).toBe('ocr');
    expect(out.ocrUsed).toBe(true);
    expect(out.pageCount).toBe(2);
  });

  it('reports a hard failure when the text layer will not open and OCR is off', async () => {
    extractTextMock.mockRejectedValue(new Error('Invalid PDF structure'));

    const out = await extractReport(input({ ocrEnabled: false }));

    expect(out.quality).toBe('failed');
    expect(out.error).toContain('Invalid PDF structure');
    expect(out.body).toBe('');
  });
});

describe('extractReport — HTML', () => {
  it('prefers Jina Reader markdown and leaves page_count null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        url: 'https://r.jina.ai/x',
        headers: new Headers(),
        text: async () => `# A research note\n\n${goodPage}`,
      })) as unknown as typeof fetch,
    );

    const html = '<html><head><title>A research note</title></head><body><h1>A research note</h1></body></html>';
    const out = await extractReport(
      input({ fileFormat: 'html', bytes: new TextEncoder().encode(html), fileName: 'note.html' }),
    );

    expect(out.method).toBe('html_jina');
    // HTML has no pages; the column stays NULL and the locator falls back to
    // heading_path.
    expect(out.pageCount).toBeNull();
    expect(out.pages).toHaveLength(1);
    expect(out.body).toContain('A research note');
    vi.unstubAllGlobals();
  });

  it('falls back to a local conversion when Jina Reader is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 503,
        url: 'https://r.jina.ai/x',
        headers: new Headers(),
        text: async () => '',
      })) as unknown as typeof fetch,
    );

    const html = `<html><body><h1>Local note</h1><p>${goodPage}</p></body></html>`;
    const out = await extractReport(
      input({ fileFormat: 'html', bytes: new TextEncoder().encode(html), fileName: 'note.html' }),
    );

    expect(out.body).toContain('Local note');
    expect(out.quality).toBe('good');
    vi.unstubAllGlobals();
  });
});
