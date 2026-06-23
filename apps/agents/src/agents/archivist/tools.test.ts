import { describe, it, expect, afterEach, vi } from 'vitest';

// tools.js transitively imports the Deepgram tool, which constructs a client at
// module load (needs an API key the test env doesn't set). Stub it — webFetch
// doesn't touch Deepgram.
vi.mock('../../tools/deepgram.js', () => ({ deepgramTranscribe: { execute: vi.fn() } }));

const { webFetch } = await import('./tools.js');

// A streaming Response that emits `body` as a single chunk, with a
// Content-Length header (defaults to the real byte length). Mirrors the shape
// fetchText's readTextCapped consumes — it reads res.headers + res.body.
function htmlResponse(body: string, contentLength?: string): Response {
  const bytes = new TextEncoder().encode(body);
  let sent = false;
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) =>
        k.toLowerCase() === 'content-length' ? (contentLength ?? String(bytes.byteLength)) : null,
    },
    body: {
      getReader() {
        return {
          async read() {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
          async cancel() {},
        };
      },
    },
    text: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('webFetch', () => {
  it('strips tags and returns the title and stripped content', async () => {
    const html = '<html><head><title>Hello</title></head><body><p>World here</p></body></html>';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse(html)));

    const out = (await webFetch.execute!({ url: 'https://x/p' } as never, {} as never)) as {
      title: string;
      rawContent: string;
    };

    expect(out.title).toBe('Hello');
    expect(out.rawContent).toContain('World here');
    expect(out.rawContent).not.toContain('<');
  });

  it('refuses an oversized body instead of buffering and regex-stripping it', async () => {
    // A Content-Length past the cap is rejected before the body is read, so a
    // giant page can never reach the regex .replace() passes (the OOM site).
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(htmlResponse('<p>x</p>', '99999999')));

    await expect(
      webFetch.execute!({ url: 'https://x/huge' } as never, {} as never),
    ).rejects.toThrow(/Failed to fetch .*too large/);
  });
});
