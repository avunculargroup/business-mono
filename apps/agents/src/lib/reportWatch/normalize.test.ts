import { describe, it, expect } from 'vitest';
import {
  normalizeReportUrl,
  urlHash,
  contentHash,
  passesUrlFilters,
  fileNameFromUrl,
} from './normalize.js';

describe('normalizeReportUrl', () => {
  it('lowercases scheme and host but leaves the path alone', () => {
    // Many CDNs serve case-sensitive paths, so lowercasing them would 404.
    expect(normalizeReportUrl('HTTPS://River.COM/Reports/Q2-2026.PDF')).toBe(
      'https://river.com/Reports/Q2-2026.PDF',
    );
  });

  it('strips tracking params and the fragment but keeps real query params', () => {
    expect(
      normalizeReportUrl('https://x.test/download?doc=q2&utm_source=rss&ref=news&fbclid=abc#page-3'),
    ).toBe('https://x.test/download?doc=q2');
  });

  it('hashes identically regardless of query-parameter order', () => {
    const a = normalizeReportUrl('https://x.test/d?b=2&a=1')!;
    const b = normalizeReportUrl('https://x.test/d?a=1&b=2')!;
    expect(urlHash(a)).toBe(urlHash(b));
  });

  it('strips a trailing slash except at the root', () => {
    expect(normalizeReportUrl('https://x.test/reports/')).toBe('https://x.test/reports');
    expect(normalizeReportUrl('https://x.test/')).toBe('https://x.test/');
  });

  it('resolves a relative href against the base', () => {
    expect(normalizeReportUrl('/files/a.pdf', 'https://river.com/reports')).toBe(
      'https://river.com/files/a.pdf',
    );
  });

  it('rejects non-http(s) and unparseable hrefs', () => {
    expect(normalizeReportUrl('mailto:hi@x.test')).toBeNull();
    expect(normalizeReportUrl('javascript:void(0)')).toBeNull();
    expect(normalizeReportUrl('   ')).toBeNull();
  });
});

describe('passesUrlFilters', () => {
  const filters = { must_match: ['\\.pdf$', '/reports/'], must_not_match: ['/tag/', '/author/'] };

  it('treats must_match as an OR', () => {
    // The canonical two-rule config: a PDF anywhere, OR anything under /reports/.
    // Requiring both would match nothing.
    expect(passesUrlFilters('https://x.test/files/a.pdf', filters)).toBe(true);
    expect(passesUrlFilters('https://x.test/reports/a', filters)).toBe(true);
    expect(passesUrlFilters('https://x.test/blog/a', filters)).toBe(false);
  });

  it('rejects on any must_not_match hit even when must_match passed', () => {
    expect(passesUrlFilters('https://x.test/reports/tag/mining', filters)).toBe(false);
  });

  it('passes everything when no filters are configured', () => {
    expect(passesUrlFilters('https://x.test/anything', undefined)).toBe(true);
  });

  it('treats an invalid regex as non-matching rather than throwing', () => {
    // A typo in one source's config must skip that source's candidates, not
    // abort the whole sweep.
    expect(() => passesUrlFilters('https://x.test/a', { must_match: ['[unclosed'] })).not.toThrow();
    expect(passesUrlFilters('https://x.test/a', { must_match: ['[unclosed'] })).toBe(false);
  });
});

describe('contentHash', () => {
  it('is stable for identical bytes and differs for a one-byte change', () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    const c = new Uint8Array([1, 2, 4]);
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).not.toBe(contentHash(c));
  });
});

describe('fileNameFromUrl', () => {
  it('takes the last path segment when it carries an extension', () => {
    expect(fileNameFromUrl('https://x.test/files/q2-2026.pdf', 'pdf')).toBe('q2-2026.pdf');
  });

  it('appends the fallback extension for extension-less paths', () => {
    expect(fileNameFromUrl('https://x.test/reports/q2-2026', 'html')).toBe('q2-2026.html');
  });

  it('falls back entirely for a bare host', () => {
    expect(fileNameFromUrl('https://x.test', 'pdf')).toBe('report.pdf');
  });
});
