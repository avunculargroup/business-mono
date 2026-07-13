import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase client so we can assert the exact RPC payload the wrapper sends.
const rpc = vi.fn();
vi.mock('@platform/db', () => ({ supabase: { rpc } }));

const { retrieveVoiceSnippets } = await import('./retrieve.js');

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: [], error: null });
});

describe('retrieveVoiceSnippets', () => {
  it('maps params to the match_voice_snippets RPC, defaulting the snippet_type filter to null', async () => {
    await retrieveVoiceSnippets({ queryEmbedding: [0.1, 0.2], accountId: 'acc-1', platform: 'linkedin' });
    expect(rpc).toHaveBeenCalledWith(
      'match_voice_snippets',
      expect.objectContaining({
        query_embedding: [0.1, 0.2],
        p_account_id: 'acc-1',
        p_platform: 'linkedin',
        p_snippet_types: null,
      }),
    );
  });

  it('forwards snippetTypes as p_snippet_types', async () => {
    await retrieveVoiceSnippets({ queryEmbedding: [0.3], snippetTypes: ['opener', 'closer'], count: 4 });
    expect(rpc).toHaveBeenCalledWith(
      'match_voice_snippets',
      expect.objectContaining({ match_count: 4, p_snippet_types: ['opener', 'closer'] }),
    );
  });

  it('throws when the RPC returns an error', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(retrieveVoiceSnippets({ queryEmbedding: [0.1] })).rejects.toThrow(/boom/);
  });
});
