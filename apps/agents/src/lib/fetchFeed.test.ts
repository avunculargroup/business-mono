import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchFeed } from './fetchFeed.js';

const RSS =
  '<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>' +
  '<item><title>Hello</title><link>https://example.com/1</link></item></channel></rss>';

function response(body: string, ok = true, status = 200): Response {
  return { ok, status, text: async () => body } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchFeed', () => {
  it('fetches directly with a browser User-Agent and parses the feed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(RSS));
    vi.stubGlobal('fetch', fetchMock);

    const feed = await fetchFeed('https://bitcoinmagazine.com/feed');

    expect(feed.items?.[0]?.title).toBe('Hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://bitcoinmagazine.com/feed');
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('Mozilla/5.0');
  });

  it('falls back to Jina Reader when the direct fetch is blocked', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('Forbidden', false, 403))
      .mockResolvedValueOnce(response(RSS));
    vi.stubGlobal('fetch', fetchMock);

    const feed = await fetchFeed('https://bitcoinmagazine.com/feed');

    expect(feed.items?.[0]?.link).toBe('https://example.com/1');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('r.jina.ai');
  });

  it('throws a combined error when both the direct fetch and Jina fail', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response('Forbidden', false, 403))
      .mockResolvedValueOnce(response('Bad Gateway', false, 502));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchFeed('https://x.com/feed')).rejects.toThrow(
      /direct fetch failed.*Jina Reader fallback failed/,
    );
  });
});
