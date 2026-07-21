import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let client: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => client),
}));

import { askLibraryQuestion, getLibraryQuestion } from './library';

function insertCall(): Record<string, unknown> | undefined {
  const b = client.__buildersFor('library_questions').find((x) => x.insert.mock.calls.length > 0);
  return b?.insert.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  client = createFakeSupabase();
  client.__setUser({ id: 'user-1' });
});

describe('askLibraryQuestion', () => {
  it('inserts a pending question for the signed-in user', async () => {
    client.__setResponse('library_questions', { data: { id: 'q1' }, error: null });

    const res = await askLibraryQuestion('How are companies accounting for bitcoin?');

    expect(res).toEqual({ id: 'q1' });
    expect(insertCall()).toMatchObject({
      question: 'How are companies accounting for bitcoin?',
      asked_by: 'user-1',
    });
  });

  it('rejects a too-short question without inserting', async () => {
    const res = await askLibraryQuestion('hi');

    expect('error' in res).toBe(true);
    expect(client.__buildersFor('library_questions')).toHaveLength(0);
  });

  it('requires a signed-in user', async () => {
    client.__setUser(null);

    const res = await askLibraryQuestion('A perfectly valid question?');

    expect('error' in res).toBe(true);
  });
});

describe('getLibraryQuestion', () => {
  it('returns the question row', async () => {
    client.__setResponse('library_questions', {
      data: { id: 'q1', question: 'Q?', status: 'answered', answer: 'A.', citations: [] },
      error: null,
    });

    const res = await getLibraryQuestion('q1');

    expect(res).toMatchObject({ question: { id: 'q1', status: 'answered', answer: 'A.' } });
  });
});
