import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const embedVoiceTextSpy = vi.fn(async () => [0.1, 0.2, 0.3]);

vi.mock('@platform/db', () => ({ supabase: fakeSupabase }));
vi.mock('@platform/voice', () => ({ embedVoiceText: embedVoiceTextSpy }));

const { backfillMissingVoiceEmbeddings } = await import('./voiceEmbeddingListener.js');

describe('backfillMissingVoiceEmbeddings', () => {
  beforeEach(() => {
    embedVoiceTextSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('embeds every row with a NULL embedding and writes it back', async () => {
    fakeSupabase.__setResponse('voice_snippets', {
      data: [
        { id: 'snip-1', body: 'Bitcoin fixes this.' },
        { id: 'snip-2', body: 'Stack sats, stay humble.' },
      ],
      error: null,
    });

    await backfillMissingVoiceEmbeddings();

    expect(embedVoiceTextSpy).toHaveBeenCalledTimes(2);
    expect(embedVoiceTextSpy).toHaveBeenCalledWith('Bitcoin fixes this.');
    expect(embedVoiceTextSpy).toHaveBeenCalledWith('Stack sats, stay humble.');

    const builders = fakeSupabase.__buildersFor('voice_snippets');
    const selectBuilder = builders[0];
    expect(selectBuilder?.select).toHaveBeenCalledWith('id, body');
    expect(selectBuilder?.is).toHaveBeenCalledWith('embedding', null);

    const updateBuilders = builders.slice(1);
    expect(updateBuilders).toHaveLength(2);
    expect(updateBuilders[0]?.update).toHaveBeenCalledWith({ embedding: [0.1, 0.2, 0.3] });
    expect(updateBuilders[0]?.eq).toHaveBeenCalledWith('id', 'snip-1');
    expect(updateBuilders[1]?.eq).toHaveBeenCalledWith('id', 'snip-2');
  });

  it('skips rows with no body without calling the embedding API', async () => {
    fakeSupabase.__setResponse('voice_snippets', {
      data: [{ id: 'snip-1', body: '' }],
      error: null,
    });

    await backfillMissingVoiceEmbeddings();

    expect(embedVoiceTextSpy).not.toHaveBeenCalled();
  });

  it('does not throw when the select itself fails', async () => {
    fakeSupabase.__setResponse('voice_snippets', {
      data: null,
      error: { message: 'boom' },
    });

    await expect(backfillMissingVoiceEmbeddings()).resolves.toBeUndefined();
    expect(embedVoiceTextSpy).not.toHaveBeenCalled();
  });

  it('continues with remaining rows when one embed fails', async () => {
    fakeSupabase.__setResponse('voice_snippets', {
      data: [
        { id: 'snip-1', body: 'first' },
        { id: 'snip-2', body: 'second' },
      ],
      error: null,
    });
    embedVoiceTextSpy.mockRejectedValueOnce(new Error('openai down')).mockResolvedValueOnce([0.4]);

    await expect(backfillMissingVoiceEmbeddings()).resolves.toBeUndefined();

    expect(embedVoiceTextSpy).toHaveBeenCalledTimes(2);
  });
});
