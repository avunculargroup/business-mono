import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchOgImage, fetchPageMeta, findJsonLdHeadline, detectPaywall, isPaywallStub, hasPaywallMarker } from './fetchOgImage.js';

function response(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as Response;
}

function page(head: string): string {
  return `<!doctype html><html><head>${head}</head><body>ignored</body></html>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchOgImage', () => {
  it('returns the og:image content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(page('<meta property="og:image" content="https://cdn.example.com/a.jpg">')),
      ),
    );

    expect(await fetchOgImage('https://example.com/story')).toBe('https://cdn.example.com/a.jpg');
  });

  it('matches when content precedes the property attribute', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(page('<meta content="https://cdn.example.com/b.jpg" property="og:image">')),
      ),
    );

    expect(await fetchOgImage('https://example.com/story')).toBe('https://cdn.example.com/b.jpg');
  });

  it('falls back to twitter:image when og:image is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(page('<meta name="twitter:image" content="https://cdn.example.com/t.jpg">')),
      ),
    );

    expect(await fetchOgImage('https://example.com/story')).toBe('https://cdn.example.com/t.jpg');
  });

  it('resolves a relative image URL against the page URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(response(page('<meta property="og:image" content="/img/c.jpg">'))),
    );

    expect(await fetchOgImage('https://example.com/news/story')).toBe('https://example.com/img/c.jpg');
  });

  it('decodes HTML entities in the image URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(page('<meta property="og:image" content="https://cdn.example.com/d.jpg?w=1920&amp;h=1080">')),
      ),
    );

    expect(await fetchOgImage('https://example.com/story')).toBe('https://cdn.example.com/d.jpg?w=1920&h=1080');
  });

  it('returns null when no image meta tag is present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('<title>No image</title>'))));

    expect(await fetchOgImage('https://example.com/story')).toBeNull();
  });

  it('returns null when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchOgImage('https://example.com/story')).toBeNull();
  });
});

describe('fetchPageMeta', () => {
  it('reads the image and the paywall flag from one fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(
        page('<meta property="og:image" content="https://cdn.example.com/a.jpg">') +
          '<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":false}</script>',
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await fetchPageMeta('https://example.com/story')).toMatchObject({
      imageUrl: 'https://cdn.example.com/a.jpg',
      paywalled: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports paywalled:false for a fetched page with no signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('<title>Open</title>'))));

    expect(await fetchPageMeta('https://example.com/story')).toMatchObject({ imageUrl: null, paywalled: false });
  });

  it('reports paywalled:null when the page cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchPageMeta('https://example.com/story')).toEqual({
      imageUrl: null,
      paywalled: null,
      titles: { og: null, jsonld: null, h1: null, twitter: null, siteName: null, htmlTitle: null },
    });
  });

  it('returns every title candidate the page offers', async () => {
    const html =
      '<html><head>' +
      '<title>Piper Alderman &gt; Australia | Legal 500</title>' +
      `<meta property="og:title" content="Saylor's bet &amp; the market">` +
      '<meta content="Twitter headline here" name="twitter:title">' +
      '<meta property="og:site_name" content="Legal 500">' +
      '</head><body><header><h1 class="t">Crossing the <em>Pacific</em>:&nbsp;Key considerations</h1></header>' +
      '<script type="application/ld+json">{"@type":"NewsArticle","headline":"From JSON-LD"}</script>' +
      '</body></html>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(html)));

    expect((await fetchPageMeta('https://example.com/story')).titles).toEqual({
      og: "Saylor's bet & the market",
      jsonld: 'From JSON-LD',
      h1: 'Crossing the Pacific: Key considerations',
      twitter: 'Twitter headline here',
      siteName: 'Legal 500',
      htmlTitle: 'Piper Alderman > Australia | Legal 500',
    });
  });
});

describe('findJsonLdHeadline', () => {
  const ld = (json: string) => `<script type="application/ld+json">${json}</script>`;

  it('reads a headline from an @graph, preferring the article node', () => {
    const html = ld(JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', headline: 'Site page' },
        { '@type': ['BlogPosting'], headline: 'Undercut &amp; out' },
      ],
    }));
    expect(findJsonLdHeadline(html)).toBe('Undercut & out');
  });

  it('skips malformed JSON and keeps looking', () => {
    const html = ld('{"@type":"NewsArticle","headline":"broken",}') + ld('[{"@type":"Article","headline":"Second block"}]');
    expect(findJsonLdHeadline(html)).toBe('Second block');
  });

  it('falls back to an untyped headline, or null when there is none', () => {
    expect(findJsonLdHeadline(ld('{"headline":"Untyped"}'))).toBe('Untyped');
    expect(findJsonLdHeadline(ld('not json at all'))).toBeNull();
    expect(findJsonLdHeadline('<p>no json-ld</p>')).toBeNull();
  });
});

describe('detectPaywall', () => {
  it.each([
    ['JSON-LD boolean', '<script type="application/ld+json">{"isAccessibleForFree": false}</script>'],
    ['JSON-LD string', '<script type="application/ld+json">{"isAccessibleForFree":"False"}</script>'],
    ['microdata', '<meta itemprop="isAccessibleForFree" content="false">'],
    ['microdata, content first', '<meta content="false" itemprop="isAccessibleForFree">'],
    ['content tier locked', '<meta property="article:content_tier" content="locked">'],
    ['content tier metered', '<meta content="metered" property="article:content_tier">'],
  ])('flags %s', (_label, html) => {
    expect(detectPaywall(page(html))).toBe(true);
  });

  it.each([
    ['free JSON-LD', '<script type="application/ld+json">{"isAccessibleForFree": true}</script>'],
    ['free content tier', '<meta property="article:content_tier" content="free">'],
    ['no markup', '<title>Story</title>'],
  ])('does not flag %s', (_label, html) => {
    expect(detectPaywall(page(html))).toBe(false);
  });
});

describe('isPaywallStub', () => {
  it('matches a subscribe-to-continue stub near the top of the body', () => {
    expect(isPaywallStub('# Headline\n\nSubscribe to continue reading this article.')).toBe(true);
  });

  it('ignores a normal article body', () => {
    expect(isPaywallStub('# Headline\n\nThe central bank held rates steady on Tuesday.')).toBe(false);
  });
});

describe('hasPaywallMarker', () => {
  it('finds FT-style wording far past the stub window', () => {
    expect(hasPaywallMarker(`${'Menu item. '.repeat(1500)}Subscribe to unlock this article`)).toBe(true);
  });

  it.each(['Register to continue reading', 'Unlock the full article', 'Already a subscriber?'])('matches "%s"', (phrase) => {
    expect(hasPaywallMarker(`Intro.\n\n${phrase}`)).toBe(true);
  });

  it('ignores a bare subscribe call-to-action in a free footer', () => {
    expect(hasPaywallMarker('Full free article text.\n\nSubscribe to our newsletter.')).toBe(false);
  });
});
