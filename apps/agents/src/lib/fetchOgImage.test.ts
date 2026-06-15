import { describe, it, expect, afterEach, vi } from 'vitest';
import { fetchOgImage } from './fetchOgImage.js';

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
