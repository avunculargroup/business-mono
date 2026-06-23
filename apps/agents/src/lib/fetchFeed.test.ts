import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchFeed, fetchText } from './fetchFeed.js';

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

// A streaming Response whose body yields `chunkCount` chunks of `chunkBytes`
// each, with an optional Content-Length header. `track` records whether the
// stream was cancelled so we can assert the download is actually stopped early.
function streamingResponse(
  chunkBytes: number,
  chunkCount: number,
  contentLength: string | null,
  track: { cancelled: boolean },
): Response {
  let emitted = 0;
  const body = {
    getReader() {
      return {
        async read() {
          if (emitted >= chunkCount) return { done: true, value: undefined };
          emitted += 1;
          return { done: false, value: new Uint8Array(chunkBytes) };
        },
        async cancel() {
          track.cancelled = true;
        },
      };
    },
  };
  return {
    ok: true,
    status: 200,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-length' ? contentLength : null) },
    body,
    text: async () => 'x'.repeat(chunkBytes * chunkCount),
  } as unknown as Response;
}

describe('fetchText byte cap', () => {
  it('returns the body when no cap is given (existing callers unchanged)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response('hello world'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://x/t.vtt', {})).resolves.toBe('hello world');
  });

  it('streams and returns a body that fits under the cap', async () => {
    const track = { cancelled: false };
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse(100, 3, '300', track));
    vi.stubGlobal('fetch', fetchMock);

    const out = await fetchText('https://x/t.vtt', {}, 1000);
    expect(out.length).toBe(300);
  });

  it('rejects early on an oversized Content-Length without reading the body', async () => {
    const track = { cancelled: false };
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse(100, 3, '999999', track));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://x/t.vtt', {}, 1000)).rejects.toThrow(/too large/);
  });

  it('aborts mid-stream when the running byte tally exceeds the cap', async () => {
    const track = { cancelled: false };
    // No Content-Length, 100 chunks of 50 bytes = 5000 bytes total, cap 200.
    const fetchMock = vi.fn().mockResolvedValue(streamingResponse(50, 100, null, track));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchText('https://x/t.vtt', {}, 200)).rejects.toThrow(/byte cap/);
    expect(track.cancelled).toBe(true);
  });
});
