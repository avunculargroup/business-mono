import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const transcriptVectorSearchSpy = vi.fn(
  (_embedding: number[], _options?: { threshold?: number; count?: number; days?: number }) =>
    Promise.resolve([] as unknown[]),
);
const embeddingsCreate = vi.fn(async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));

vi.mock('@platform/db', () => ({
  supabase: fakeSupabase,
  transcriptVectorSearch: transcriptVectorSearchSpy,
}));
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: embeddingsCreate };
  },
}));

const { queryTranscripts, fetchUrl } = await import('./tools.js');

// The tool passes the input straight through as the first execute arg in this
// Mastra version (see tools/newsSources.test.ts for the same convention).
function run(input: Record<string, unknown>): Promise<unknown> {
  return queryTranscripts.execute!(input as never, {} as never) as Promise<unknown>;
}

describe('queryTranscripts', () => {
  beforeEach(() => {
    transcriptVectorSearchSpy.mockClear();
    embeddingsCreate.mockClear();
    transcriptVectorSearchSpy.mockResolvedValue([]);
  });

  it('searches transcripts with a threshold low enough for keyword queries', async () => {
    await run({ query: 'Bitcoin', limit: 10 });

    expect(transcriptVectorSearchSpy).toHaveBeenCalledTimes(1);
    const options = transcriptVectorSearchSpy.mock.calls[0]![1];
    // The wrapper's own default (0.5) is too high for this long-segment corpus
    // and made a "Bitcoin" search return nothing — guard against a regression.
    expect(options).toEqual(expect.objectContaining({ threshold: 0.2, count: 10 }));
    expect(options!.threshold).toBeLessThan(0.5);
  });

  it('maps matching segments to a deep-link at the matched moment', async () => {
    transcriptVectorSearchSpy.mockResolvedValue([
      {
        segment_id: 'seg-1',
        episode_id: 'ep-1',
        episode_title: 'Sound money weekly',
        source_name: 'The Treasury Show',
        start_seconds: 90,
        end_seconds: 120,
        speaker: 'Guest',
        content: 'Companies hold bitcoin as a reserve asset.',
        youtube_url: 'https://youtu.be/abc',
        audio_url: null,
        curator_note: null,
        published_at: '2026-05-01T00:00:00Z',
        similarity: 0.41,
      },
    ] as never);

    const result = (await run({ query: 'bitcoin treasury', limit: 5 })) as {
      count: number;
      results: { deep_link: string | null; episode_title: string }[];
    };

    expect(result.count).toBe(1);
    expect(result.results[0]!.deep_link).toBe('https://youtu.be/abc?t=90s');
    expect(result.results[0]!.episode_title).toBe('Sound money weekly');
  });
});

describe('fetchUrl', () => {
  const fetchSpy = vi.fn();

  beforeEach(() => {
    fetchSpy.mockReset();
    vi.stubGlobal('fetch', fetchSpy);
    delete process.env['JINA_API_KEY'];
  });

  function jina(content: string, url = 'https://afr.com/a') {
    return new Response(JSON.stringify({ data: { title: 'T', content, url } }), { status: 200 });
  }

  function fetchTool(input: Record<string, unknown>) {
    return fetchUrl.execute!(input as never, {} as never) as Promise<Record<string, unknown>>;
  }

  it('asks Jina to drop images and sends no key when none is set', async () => {
    fetchSpy.mockResolvedValue(jina('body'));
    await fetchTool({ url: 'https://afr.com/a' });
    const headers = fetchSpy.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['X-Retain-Images']).toBe('none');
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['X-Target-Selector']).toBeUndefined();
  });

  it('sends the API key and selectors when given', async () => {
    process.env['JINA_API_KEY'] = 'test-key';
    fetchSpy.mockResolvedValue(jina('body'));
    await fetchTool({ url: 'https://afr.com/a', target_selector: 'article', remove_selector: '.promo' });
    const headers = fetchSpy.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-key');
    expect(headers['X-Target-Selector']).toBe('article');
    expect(headers['X-Remove-Selector']).toBe('.promo');
  });

  it('flags a body cut at the 50,000-character cap, keeping the output shape', async () => {
    fetchSpy.mockResolvedValue(jina('x'.repeat(50_001)));
    const out = await fetchTool({ url: 'https://afr.com/a' });
    expect(out).toMatchObject({ title: 'T', resolved_url: 'https://afr.com/a', truncated: true });
    expect((out['markdown'] as string).length).toBe(50_000);

    fetchSpy.mockResolvedValue(jina('x'.repeat(50_000)));
    expect((await fetchTool({ url: 'https://afr.com/a' }))['truncated']).toBe(false);
  });
});
