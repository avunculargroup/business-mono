import { describe, it, expect, afterEach, vi } from 'vitest';
import { decodeHtmlEntities, isEmailSafeImage } from './emailImage.js';

function imageResponse(contentType: string, ok = true, status = 200): Response {
  return { ok, status, headers: new Headers({ 'content-type': contentType }) } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('decodeHtmlEntities', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeHtmlEntities('a.jpg?w=1&amp;h=2&#38;q=3&#x26;f=4')).toBe('a.jpg?w=1&h=2&q=3&f=4');
  });

  it('does not double-decode an encoded ampersand', () => {
    expect(decodeHtmlEntities('&amp;amp;')).toBe('&amp;');
  });

  it('leaves a plain URL unchanged', () => {
    expect(decodeHtmlEntities('https://cdn.example.com/a.jpg?w=1&h=2')).toBe('https://cdn.example.com/a.jpg?w=1&h=2');
  });
});

describe('isEmailSafeImage', () => {
  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/JPEG; charset=binary'])('accepts %s', async (type) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(type)));
    expect(await isEmailSafeImage('https://cdn.example.com/a')).toBe(true);
  });

  it.each(['image/webp', 'image/avif', 'image/svg+xml', 'text/html', ''])('rejects %s', async (type) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse(type)));
    expect(await isEmailSafeImage('https://cdn.example.com/a')).toBe(false);
  });

  it('rejects a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse('image/jpeg', false, 403)));
    expect(await isEmailSafeImage('https://cdn.example.com/a.jpg')).toBe(false);
  });

  it('rejects when the fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await isEmailSafeImage('https://cdn.example.com/a.jpg')).toBe(false);
  });

  it('rejects a non-http URL without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await isEmailSafeImage('data:image/png;base64,AAAA')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
