import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const answerSpy = vi.fn(async () => undefined);

vi.mock('@platform/db', () => ({ createRealtimeClient: () => fakeSupabase }));
vi.mock('../workflows/libraryAnswer/index.js', () => ({ answerLibraryQuestion: answerSpy }));

const { handleLibraryQuestionRow, reconcilePendingQuestions } = await import('./libraryQuestionListener.js');

describe('handleLibraryQuestionRow', () => {
  beforeEach(() => {
    answerSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('claims a pending question and answers it', async () => {
    fakeSupabase.__setResponse('library_questions', { data: [{ id: 'q1' }], error: null });

    await handleLibraryQuestionRow({ id: 'q1', status: 'pending' });

    const builder = fakeSupabase.__buildersFor('library_questions')[0];
    expect(builder?.update).toHaveBeenCalledWith({ status: 'answering' });
    expect(builder?.eq).toHaveBeenCalledWith('status', 'pending');
    expect(answerSpy).toHaveBeenCalledWith('q1');
  });

  it('does not answer when the claim affects no row (already taken)', async () => {
    fakeSupabase.__setResponse('library_questions', { data: [], error: null });

    await handleLibraryQuestionRow({ id: 'q1', status: 'pending' });

    expect(answerSpy).not.toHaveBeenCalled();
  });

  it('ignores a row that is not pending without touching the db', async () => {
    await handleLibraryQuestionRow({ id: 'q1', status: 'answering' });

    expect(fakeSupabase.from).not.toHaveBeenCalled();
    expect(answerSpy).not.toHaveBeenCalled();
  });
});

describe('reconcilePendingQuestions', () => {
  beforeEach(() => {
    answerSpy.mockClear();
    fakeSupabase.from.mockClear();
    fakeSupabase.__responses.clear();
    fakeSupabase.__builders.length = 0;
  });

  it('sweeps and answers questions Realtime missed', async () => {
    fakeSupabase.__setResponse('library_questions', { data: [{ id: 'q9', status: 'pending' }], error: null });

    await reconcilePendingQuestions();

    const builder = fakeSupabase.__buildersFor('library_questions')[0];
    expect(builder?.select).toHaveBeenCalledWith('id, status');
    expect(answerSpy).toHaveBeenCalledWith('q9');
  });
});
