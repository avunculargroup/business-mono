import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  createLinkedInPost,
  escapeLinkedInText,
  linkedInPostUrl,
  LinkedInAuthError,
  LINKEDIN_VERSION,
} from './linkedin.js';

function response(status: number, headers: Record<string, string> = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    text: async () => '',
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('escapeLinkedInText', () => {
  it('escapes Little Text Format reserved characters', () => {
    expect(escapeLinkedInText('AUD (spot) #Bitcoin')).toBe('AUD \\(spot\\) \\#Bitcoin');
    expect(escapeLinkedInText('a*b_c~d|e{f}g[h]i<j>k@l')).toBe(
      'a\\*b\\_c\\~d\\|e\\{f\\}g\\[h\\]i\\<j\\>k\\@l',
    );
    expect(escapeLinkedInText('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves plain text and line breaks untouched', () => {
    expect(escapeLinkedInText('Two lines.\n\nSecond paragraph, 21m BTC.')).toBe(
      'Two lines.\n\nSecond paragraph, 21m BTC.',
    );
  });
});

describe('linkedInPostUrl', () => {
  it('builds a feed update URL from the post URN', () => {
    expect(linkedInPostUrl('urn:li:share:12345')).toBe(
      'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A12345',
    );
  });
});

describe('createLinkedInPost', () => {
  const input = {
    accessToken: 'tok',
    authorUrn: 'urn:li:person:abc',
    text: 'Hello (world)',
  };

  it('posts escaped commentary with versioned headers and returns the URN', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response(201, { 'x-restli-id': 'urn:li:share:99' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await createLinkedInPost(input);

    expect(result).toEqual({ postUrn: 'urn:li:share:99' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    const headers = init.headers as Record<string, string>;
    expect(headers['Linkedin-Version']).toBe(LINKEDIN_VERSION);
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(headers['Authorization']).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body.author).toBe('urn:li:person:abc');
    expect(body.commentary).toBe('Hello \\(world\\)');
    expect(body.lifecycleState).toBe('PUBLISHED');
  });

  it('throws LinkedInAuthError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401)));

    await expect(createLinkedInPost(input)).rejects.toBeInstanceOf(LinkedInAuthError);
  });

  it('throws a plain error on other failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(422)));

    await expect(createLinkedInPost(input)).rejects.toThrow('LinkedIn post failed: 422');
  });

  it('throws when the created-post header is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(201)));

    await expect(createLinkedInPost(input)).rejects.toThrow('no x-restli-id header');
  });
});
