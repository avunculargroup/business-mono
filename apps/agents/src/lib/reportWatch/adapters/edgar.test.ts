import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { archiveUrl, edgarAdapter, parseSubmissions, submissionsUrl } from './edgar.js';

const NOW = new Date('2026-10-05T00:00:00Z');
const SUBMISSIONS = JSON.parse(
  readFileSync(new URL('./__fixtures__/edgar-submissions.json', import.meta.url), 'utf8'),
) as unknown;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSubmissions', () => {
  const parse = (config: Record<string, unknown> = {}) =>
    parseSubmissions(SUBMISSIONS, { cik: '1050446', since: '2026-09-01', ...config }, NOW)!;

  it('keeps the 8-Ks that state a wanted item, and nothing else the filer files', () => {
    // Dropped: an 8-K about a board change (5.02), a Form 4, a prospectus
    // supplement, and an 8-K from before `since`.
    expect(parse().map((c) => c.filing?.accession)).toEqual([
      '0001193125-26-401111',
      '0001193125-26-395555',
      '0001193125-26-389858',
    ]);
  });

  it('describes each filing as the venue states it, at the address the hand entries use', () => {
    const [first] = parse();

    expect(first).toEqual({
      rawUrl: 'https://www.sec.gov/Archives/edgar/data/1050446/000119312526401111/mstr-20260929.htm',
      titleHint: 'Form 8-K — Items 7.01, 8.01, 9.01',
      publishedAtHint: '2026-09-29',
      filing: {
        form: '8-K',
        accession: '0001193125-26-401111',
        items: ['7.01', '8.01', '9.01'],
        reportDate: '2026-09-29',
        filerName: 'Strategy Inc',
      },
    });
  });

  it('takes the forms and items it is configured with', () => {
    expect(parse({ forms: ['424B5'] }).map((c) => c.filing?.form)).toEqual(['424B5']);
    expect(parse({ items_8k: ['5.02'] }).map((c) => c.filing?.accession)).toEqual([
      '0001193125-26-399000',
    ]);
  });

  it('looks back 90 days when no date is configured', () => {
    const all = parseSubmissions(SUBMISSIONS, { cik: '1050446' }, NOW)!;
    // 14 July is 83 days before 5 October.
    expect(all.map((c) => c.filing?.accession)).toContain('0001193125-26-300000');
  });

  it('refuses a body it does not understand rather than calling it quiet', () => {
    expect(parseSubmissions({ name: 'x' }, { cik: '1' }, NOW)).toBeNull();
  });
});

describe('edgarAdapter', () => {
  it('asks the SEC for the filer index with a contact in the user agent', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      url: submissionsUrl('1050446'),
      headers: new Headers(),
      text: async () => JSON.stringify(SUBMISSIONS),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await edgarAdapter.discover({
      config: { edgar: { cik: '1050446', since: '2026-09-01' } },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok && result.candidates).toHaveLength(3);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string> }];
    expect(url).toBe('https://data.sec.gov/submissions/CIK0001050446.json');
    expect(init.headers['User-Agent']).toMatch(/@btreasury\.com\.au/);
  });

  it('reports a missing or malformed CIK as a config error, without a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await edgarAdapter.discover({ config: { edgar: { cik: 'MSTR' } }, siteUrl: null, now: NOW });

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'config' }) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a non-JSON body as a parse failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, url: '', headers: new Headers(), text: async () => '<html>' })),
    );

    const result = await edgarAdapter.discover({ config: { edgar: { cik: '1050446' } }, siteUrl: null, now: NOW });

    expect(result).toEqual({ ok: false, error: expect.objectContaining({ kind: 'parse' }) });
  });
});

describe('archiveUrl', () => {
  it('strips the padding and the dashes, as EDGAR paths do', () => {
    expect(archiveUrl('0001383395', '0001383395-26-000110', 'ex.htm')).toBe(
      'https://www.sec.gov/Archives/edgar/data/1383395/000138339526000110/ex.htm',
    );
  });
});
