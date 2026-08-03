import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rssAdapter } from './rss.js';
import { sitemapAdapter } from './sitemap.js';
import { indexPageAdapter } from './indexPage.js';

const NOW = new Date('2026-08-03T00:00:00Z');

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');

/** Serve one body for every request. */
function mockFetch(body: string, status = 200) {
  return vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    url: 'https://example.test/fetched',
    headers: new Headers(),
    text: async () => body,
  })) as unknown as typeof fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('rssAdapter', () => {
  it('prefers the enclosure over the item link when both are present', async () => {
    vi.stubGlobal('fetch', mockFetch(fixture('reports-feed.xml')));

    const result = await rssAdapter.discover({
      config: { rss: { feed_url: 'https://fidelity.example/feed' } },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates).toHaveLength(2);
    // The feed announces a landing page but encloses the artefact — taking the
    // link would cost a hop for information already in hand.
    expect(result.candidates[0]).toMatchObject({
      rawUrl: 'https://fidelity.example/files/q2-2026-flows.pdf',
      titleHint: 'Q2 2026 Institutional Flows',
      publishedAtHint: '2026-07-01',
      landingUrl: 'https://fidelity.example/research/q2-2026-flows',
    });
  });

  it('falls back to the link and unwraps CDATA titles', async () => {
    vi.stubGlobal('fetch', mockFetch(fixture('reports-feed.xml')));

    const result = await rssAdapter.discover({
      config: { rss: { feed_url: 'https://fidelity.example/feed' } },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[1]).toMatchObject({
      rawUrl: 'https://fidelity.example/research/week-onchain-29?utm_campaign=rss',
      titleHint: 'Week On-chain 29',
      publishedAtHint: '2026-07-21',
      landingUrl: null,
    });
  });

  it('reports a config error rather than an empty read when feed_url is missing', async () => {
    const result = await rssAdapter.discover({ config: {}, siteUrl: null, now: NOW });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('config');
  });

  it('surfaces an HTTP failure as an error, never as zero candidates', async () => {
    // An empty candidate list is the silent-failure signal Simon alerts on, so
    // a transport failure must not be able to fabricate one.
    vi.stubGlobal('fetch', mockFetch('', 503));
    const result = await rssAdapter.discover({
      config: { rss: { feed_url: 'https://down.example/feed' } },
      siteUrl: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });
});

describe('sitemapAdapter', () => {
  it('filters by path prefix and exclusions, newest lastmod first', async () => {
    vi.stubGlobal('fetch', mockFetch(fixture('sitemap.xml')));

    const result = await sitemapAdapter.discover({
      config: {
        sitemap: {
          sitemap_url: 'https://ark.example/sitemap.xml',
          path_prefix: '/reports/',
          path_exclude: ['/reports/archive/'],
        },
      },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.map((c) => c.rawUrl)).toEqual([
      'https://ark.example/reports/monthly-2026-06.pdf',
      'https://ark.example/reports/big-ideas-2026.pdf',
    ]);
    expect(result.candidates[0].publishedAtHint).toBe('2026-06-30');
    // A sitemap carries no title — inventing one would be worse than none.
    expect(result.candidates[0].titleHint).toBeNull();
  });

  it('follows a sitemap index one level', async () => {
    const index = `<?xml version="1.0"?><sitemapindex>
      <sitemap><loc>https://ark.example/sitemap-reports.xml</loc><lastmod>2026-07-01</lastmod></sitemap>
    </sitemapindex>`;
    const child = `<?xml version="1.0"?><urlset>
      <url><loc>https://ark.example/reports/child.pdf</loc><lastmod>2026-07-01</lastmod></url>
    </urlset>`;
    let call = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        url: 'https://ark.example/x',
        headers: new Headers(),
        text: async () => (call++ === 0 ? index : child),
      })) as unknown as typeof fetch,
    );

    const result = await sitemapAdapter.discover({
      config: { sitemap: { sitemap_url: 'https://ark.example/sitemap.xml' } },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates.map((c) => c.rawUrl)).toEqual(['https://ark.example/reports/child.pdf']);
  });

  it('errors on a body with neither <url> nor <sitemap>', async () => {
    vi.stubGlobal('fetch', mockFetch('<html>not a sitemap</html>'));
    const result = await sitemapAdapter.discover({
      config: { sitemap: { sitemap_url: 'https://ark.example/sitemap.xml' } },
      siteUrl: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
  });
});

describe('indexPageAdapter', () => {
  const config = {
    index_page: {
      index_url: 'https://river.com/reports',
      item_selector: 'article.report-card',
      title_selector: 'h3',
      date_selector: 'time',
      follow_to_pdf: true,
    },
  };

  it('prefers an in-card PDF link over the card link, needing no hop', async () => {
    vi.stubGlobal('fetch', mockFetch(fixture('river-reports.html')));

    const result = await indexPageAdapter.discover({ config, siteUrl: null, now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[0]).toMatchObject({
      rawUrl: 'https://river.com/files/adoption-2026.pdf',
      titleHint: 'Bitcoin Adoption Report 2026',
      publishedAtHint: '2026-07-15',
      landingUrl: null,
    });
  });

  it('marks a card with no PDF link for a one-hop follow', async () => {
    vi.stubGlobal('fetch', mockFetch(fixture('river-reports.html')));

    const result = await indexPageAdapter.discover({ config, siteUrl: null, now: NOW });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.candidates[1]).toMatchObject({
      rawUrl: 'https://river.com/reports/mining-q2-2026?utm_source=homepage',
      titleHint: 'Mining Economics Q2',
      publishedAtHint: '2026-04-02',
    });
    expect(result.candidates[1].landingUrl).toBe('https://river.com/reports/mining-q2-2026?utm_source=homepage');
  });

  it('treats a selector that matches nothing as a parse failure', async () => {
    // Zero items is exactly what a renamed class looks like. Reporting it as a
    // clean empty read would feed the silent-failure counter a false negative.
    vi.stubGlobal('fetch', mockFetch(fixture('river-reports.html')));

    const result = await indexPageAdapter.discover({
      config: { index_page: { index_url: 'https://river.com/reports', item_selector: '.gone' } },
      siteUrl: null,
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('parse');
    expect(result.error.message).toContain('.gone');
  });

  it('requires item_selector', async () => {
    const result = await indexPageAdapter.discover({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: { index_page: { index_url: 'https://river.com/reports' } as any },
      siteUrl: null,
      now: NOW,
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe('config');
  });
});
