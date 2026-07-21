import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { ComplianceVerdict } from '../../agents/compliance/index.js';
import type { TranscriptVectorSearchResult } from '@platform/db';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const transcriptVectorSearch = vi.fn();
const embedTexts = vi.fn();
const rexGenerate = vi.fn();
const lexGenerate = vi.fn();

vi.mock('@platform/db', () => ({
  get supabase() { return fakeSupabase; },
  transcriptVectorSearch: (...args: unknown[]) => transcriptVectorSearch(...args),
}));
vi.mock('../../lib/contentEmbeddings.js', () => ({ embedTexts: (...a: unknown[]) => embedTexts(...a) }));
vi.mock('../../agents/researcher/index.js', () => ({ rex: { generate: rexGenerate } }));
vi.mock('../../agents/compliance/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agents/compliance/index.js')>();
  return { ...actual, lex: { generate: lexGenerate } };
});

const { answerLibraryQuestion } = await import('./index.js');

const PASS: ComplianceVerdict = { passes: true, flags: [], rationale: 'Described neutrally.', suggested_rewrite: null };

function hit(overrides: Partial<TranscriptVectorSearchResult> = {}): TranscriptVectorSearchResult {
  return {
    segment_id: 'seg', episode_id: 'ep-1', episode_title: 'Custody in 2026', source_name: null,
    start_seconds: 90, end_seconds: 120, speaker: 'GUEST',
    content: 'Multisig custody is a board decision.', youtube_url: null, audio_url: null,
    curator_note: null, published_at: null, similarity: 0.7, ...overrides,
  };
}

function updateCall(): Record<string, unknown> | undefined {
  const b = fakeSupabase.__buildersFor('library_questions').find((x) => x.update.mock.calls.length > 0);
  return b?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  transcriptVectorSearch.mockReset();
  embedTexts.mockReset();
  rexGenerate.mockReset();
  lexGenerate.mockReset();
  fakeSupabase.from.mockClear();
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  embedTexts.mockResolvedValue([[0.1, 0.2, 0.3]]);
  transcriptVectorSearch.mockResolvedValue([hit({ episode_id: 'a' }), hit({ episode_id: 'b' })]);
  rexGenerate.mockResolvedValue({ object: { answer: 'The guests discussed board-level custody.', cited_sources: [2] } });
  lexGenerate.mockResolvedValue({ object: PASS });
});

describe('answerLibraryQuestion', () => {
  it('retrieves, synthesises, resolves citations, reviews, and persists an answer', async () => {
    fakeSupabase.__setResponses('library_questions', [
      { data: { id: 'q1', question: 'How is custody handled?', status: 'answering' }, error: null },
      { data: null, error: null },
    ]);

    await answerLibraryQuestion('q1');

    expect(embedTexts).toHaveBeenCalledWith(['How is custody handled?']);
    expect(rexGenerate).toHaveBeenCalledOnce();
    expect(lexGenerate).toHaveBeenCalledOnce();

    const update = updateCall();
    expect(update).toMatchObject({
      status: 'answered',
      answer: 'The guests discussed board-level custody.',
      lex_verdict: PASS,
      no_answer: false,
    });
    // cited_sources [2] resolves to the 2nd retrieved segment (episode b).
    expect(update?.citations).toEqual([
      expect.objectContaining({ episode_id: 'b', start_seconds: 90 }),
    ]);
  });

  it('marks no_answer when retrieval finds nothing, without calling the model', async () => {
    transcriptVectorSearch.mockResolvedValue([]);
    fakeSupabase.__setResponses('library_questions', [
      { data: { id: 'q1', question: 'Anything on altcoins?', status: 'answering' }, error: null },
      { data: null, error: null },
    ]);

    await answerLibraryQuestion('q1');

    expect(rexGenerate).not.toHaveBeenCalled();
    expect(updateCall()).toMatchObject({ status: 'answered', no_answer: true, answer: null });
  });

  it('marks the question failed when synthesis throws', async () => {
    rexGenerate.mockRejectedValue(new Error('LLM down'));
    fakeSupabase.__setResponses('library_questions', [
      { data: { id: 'q1', question: 'How is custody handled?', status: 'answering' }, error: null },
      { data: null, error: null },
    ]);

    await answerLibraryQuestion('q1');

    expect(updateCall()).toMatchObject({ status: 'failed' });
  });

  it('fails safe (Lex not passing) when the compliance call throws', async () => {
    lexGenerate.mockRejectedValue(new Error('LLM down'));
    fakeSupabase.__setResponses('library_questions', [
      { data: { id: 'q1', question: 'How is custody handled?', status: 'answering' }, error: null },
      { data: null, error: null },
    ]);

    await answerLibraryQuestion('q1');

    const update = updateCall();
    expect(update).toMatchObject({ status: 'answered' });
    expect((update?.lex_verdict as ComplianceVerdict).passes).toBe(false);
  });
});
