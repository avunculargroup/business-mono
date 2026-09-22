import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchOgImage, fetchPageMeta, detectPaywall, isPaywallStub } from './fetchOgImage.js';

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

    expect(await fetchPageMeta('https://example.com/story')).toEqual({
      imageUrl: 'https://cdn.example.com/a.jpg',
      paywalled: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports paywalled:false for a fetched page with no signal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(page('<title>Open</title>'))));

    expect(await fetchPageMeta('https://example.com/story')).toEqual({ imageUrl: null, paywalled: false });
  });

  it('reports paywalled:null when the page cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    expect(await fetchPageMeta('https://example.com/story')).toEqual({ imageUrl: null, paywalled: null });
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
