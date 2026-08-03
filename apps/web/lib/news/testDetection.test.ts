import { describe, it, expect, vi, afterEach } from 'vitest';
import { testDetection } from './testDetection';

function mockFetch(body: string, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    url: 'https://river.com/reports',
    headers: new Headers(),
    text: async () => body,
  })) as unknown as typeof fetch;
}

const INDEX_HTML = `<!doctype html><html><body>
  <article class="report-card">
    <h3>Bitcoin Adoption Report 2026</h3>
    <time datetime="2026-07-15">15 July 2026</time>
    <a href="/reports/adoption-2026">Read</a>
    <a href="/files/adoption-2026.pdf">Download PDF</a>
  </article>
  <article class="report-card">
    <h3>Mining Economics Q2</h3>
    <time datetime="2026-04-02">2 April 2026</time>
    <a href="/reports/mining-q2?utm_source=home">Read</a>
  </article>
  <article class="report-card">
    <h3>Tag page</h3>
    <a href="/tag/mining">All mining</a>
  </article>
</body></html>`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testDetection — index_page', () => {
  const config = {
    index_page: {
      index_url: 'https://river.com/reports',
      item_selector: 'article.report-card',
      title_selector: 'h3',
      date_selector: 'time',
      follow_to_pdf: true,
    },
    url_filters: { must_match: ['\\.pdf$', '/reports/'], must_not_match: ['/tag/'] },
  };

  it('reports a filter verdict per row rather than hiding rejections', async () => {
    vi.stubGlobal('fetch', mockFetch(INDEX_HTML));

    const result = await testDetection('index_page', config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.total).toBe(3);
    expect(result.accepted).toBe(2);
    // The rejected row is shown, not dropped — seeing why a URL was rejected is
    // the whole point of the preview.
    expect(result.rows[2]).toMatchObject({ url: 'https://river.com/tag/mining', accepted: false });
  });

  it('applies the same URL normalisation the scan uses', async () => {
    vi.stubGlobal('fetch', mockFetch(INDEX_HTML));

    const result = await testDetection('index_page', config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // utm_source stripped, exactly as the daily scan would. A preview that
    // normalised differently would report something untrue.
    expect(result.rows[1].url).toBe('https://river.com/reports/mining-q2');
  });

  it('flags rows that would need a one-hop follow', async () => {
    vi.stubGlobal('fetch', mockFetch(INDEX_HTML));

    const result = await testDetection('index_page', config);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Card 1 has an in-card PDF link, so no hop. Card 2 does not.
    expect(result.rows[0]).toMatchObject({ url: 'https://river.com/files/adoption-2026.pdf', followsHop: false });
    expect(result.rows[1].followsHop).toBe(true);
  });

  it('explains a selector that matched nothing instead of returning zero rows', async () => {
    vi.stubGlobal('fetch', mockFetch(INDEX_HTML));

    const result = await testDetection('index_page', {
      index_page: { index_url: 'https://river.com/reports', item_selector: '.gone' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('.gone');
    expect(result.error).toContain('inspect');
  });

  it('never throws on a transport failure', async () => {
    vi.stubGlobal('fetch', mockFetch('', false, 503));
    const result = await testDetection('index_page', config);
    expect(result.ok).toBe(false);
  });
});

describe('testDetection — rss', () => {
  const FEED = `<rss><channel>
    <item>
      <title>Q2 2026 Flows</title>
      <link>https://f.example/research/q2</link>
      <enclosure url="https://f.example/files/q2.pdf" type="application/pdf"/>
      <pubDate>Tue, 01 Jul 2026 09:00:00 GMT</pubDate>
    </item>
  </channel></rss>`;

  it('prefers the enclosure over the item link, matching the scan', async () => {
    vi.stubGlobal('fetch', mockFetch(FEED));

    const result = await testDetection('rss', { rss: { feed_url: 'https://f.example/feed' } });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]).toMatchObject({
      url: 'https://f.example/files/q2.pdf',
      title: 'Q2 2026 Flows',
      publishedAt: '2026-07-01',
    });
  });

  it('says so when no feed URL is configured', async () => {
    const result = await testDetection('rss', {});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('No feed URL');
  });
});

describe('testDetection — sitemap', () => {
  const SITEMAP = `<urlset>
    <url><loc>https://ark.example/reports/a.pdf</loc><lastmod>2026-06-30</lastmod></url>
    <url><loc>https://ark.example/reports/archive/old.pdf</loc><lastmod>2019-01-01</lastmod></url>
    <url><loc>https://ark.example/blog/post</loc><lastmod>2026-07-30</lastmod></url>
  </urlset>`;

  it('filters by prefix and exclusion, newest first', async () => {
    vi.stubGlobal('fetch', mockFetch(SITEMAP));

    const result = await testDetection('sitemap', {
      sitemap: {
        sitemap_url: 'https://ark.example/sitemap.xml',
        path_prefix: '/reports/',
        path_exclude: ['/reports/archive/'],
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows.map((r) => r.url)).toEqual(['https://ark.example/reports/a.pdf']);
  });

  it('tells the operator a sitemap index needs a direct sitemap URL', async () => {
    // The scan follows an index; a preview that quietly fetched five more
    // documents would not be a preview.
    vi.stubGlobal('fetch', mockFetch('<sitemapindex><sitemap><loc>x</loc></sitemap></sitemapindex>'));

    const result = await testDetection('sitemap', {
      sitemap: { sitemap_url: 'https://ark.example/sitemap.xml' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('sitemap index');
  });
});
