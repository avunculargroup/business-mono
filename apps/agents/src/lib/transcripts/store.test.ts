import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '../../../test/mocks/supabase.js';

const fake = createFakeSupabase();
vi.mock('@platform/db', () => ({ get supabase() { return fake; } }));

const { insertEpisodeIfNew } = await import('./store.js');

const row = {
  source_id: 'src-1',
  guid: 'guid-1',
  title: 'Episode 1',
} as const;

describe('insertEpisodeIfNew', () => {
  it('returns the new id on a clean insert', async () => {
    fake.__setResponse('podcast_episodes', { data: { id: 'ep-1' }, error: null });
    await expect(insertEpisodeIfNew({ ...row })).resolves.toBe('ep-1');
  });

  it('returns null on a duplicate-guid unique violation (23505) instead of throwing', async () => {
    fake.__setResponse('podcast_episodes', {
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "podcast_episodes_source_guid_uniq"',
      } as { message: string },
    });
    await expect(insertEpisodeIfNew({ ...row })).resolves.toBeNull();
  });

  it('throws on any other insert error', async () => {
    fake.__setResponse('podcast_episodes', {
      data: null,
      error: { code: '23502', message: 'null value in column violates not-null constraint' } as { message: string },
    });
    await expect(insertEpisodeIfNew({ ...row })).rejects.toThrow('podcast_episodes insert failed');
  });
});
