import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { embedQuery } = vi.hoisted(() => ({ embedQuery: vi.fn() }));
vi.mock('@/lib/openaiEmbedding', () => ({ embedQuery }));

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { searchTranscripts } from './podcastSearch';

beforeEach(() => {
  client = createFakeSupabase();
  embedQuery.mockReset();
  embedQuery.mockResolvedValue([0.1, 0.2, 0.3]);
});

describe('searchTranscripts', () => {
  it('rejects a query shorter than the minimum without embedding', async () => {
    const result = await searchTranscripts('bi');

    expect(result).toEqual({ error: 'Enter a few words to search for.' });
    expect(embedQuery).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('runs the vector RPC with a threshold low enough for keyword queries', async () => {
    client.rpc.mockResolvedValue({ data: [], error: null });

    await searchTranscripts('Bitcoin');

    expect(client.rpc).toHaveBeenCalledWith(
      'vector_search_transcripts',
      expect.objectContaining({ match_threshold: 0.2, match_count: 20 }),
    );
    // The RPC's own default (0.5) is too high for this long-segment corpus and
    // is what made a "Bitcoin" search return nothing — guard against a regression.
    const passed = client.rpc.mock.calls[0]?.[1] as { match_threshold: number };
    expect(passed.match_threshold).toBeLessThan(0.5);
  });

  it('returns the RPC rows on success', async () => {
    const row = { segment_id: 'seg-1', episode_id: 'ep-1', content: 'bitcoin talk', similarity: 0.4 };
    client.rpc.mockResolvedValue({ data: [row], error: null });

    const result = await searchTranscripts('Bitcoin');

    expect(result).toEqual({ results: [row] });
  });

  it('maps an RPC error to a humane message', async () => {
    client.rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const result = await searchTranscripts('Bitcoin');

    expect(result).toHaveProperty('error');
    expect(result).not.toHaveProperty('results');
  });
});
