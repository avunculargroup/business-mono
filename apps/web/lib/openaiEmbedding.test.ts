import { describe, it, expect, vi, afterEach } from 'vitest';
import { embedQuery } from './openaiEmbedding';
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from '@platform/shared';

const ORIGINAL_KEY = process.env['OPENAI_API_KEY'];

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env['OPENAI_API_KEY'];
  else process.env['OPENAI_API_KEY'] = ORIGINAL_KEY;
  vi.unstubAllGlobals();
});

describe('embedQuery', () => {
  it('throws when the API key is missing', async () => {
    delete process.env['OPENAI_API_KEY'];
    await expect(embedQuery('bitcoin custody')).rejects.toThrow(/OPENAI_API_KEY/);
  });

  it('posts the ingestion model + dimensions and returns the vector', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    const vec = [0.1, 0.2, 0.3];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ embedding: vec }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await embedQuery('bitcoin custody');
    expect(out).toEqual(vec);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/embeddings');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe(EMBEDDING_MODEL);
    expect(body.dimensions).toBe(EMBEDDING_DIMENSIONS);
    expect(body.input).toBe('bitcoin custody');
  });

  it('throws on a non-2xx response', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }));
    await expect(embedQuery('rate limited')).rejects.toThrow(/429/);
  });

  it('throws when the embedding payload is empty', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }));
    await expect(embedQuery('no vector')).rejects.toThrow(/empty/);
  });
});
