import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import type { ComplianceVerdict } from '../../agents/compliance/index.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const rogerGenerate = vi.fn();
const lexGenerate = vi.fn();
const scoreEpisodeRelevance = vi.fn();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../../agents/recorder/agent.js', () => ({ roger: { generate: rogerGenerate } }));
vi.mock('../../agents/compliance/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../agents/compliance/index.js')>();
  return { ...actual, lex: { generate: lexGenerate } };
});
vi.mock('../podcastRubric.js', () => ({ scoreEpisodeRelevance }));

const SCORE = {
  relevanceScore: 0.78,
  dimensionScores: { material: 0.8, novelty: 0.7, citation: 0.8 },
  category: 'macro',
  relevanceReasoning: 'Material macro thesis, familiar framing.',
  flags: [],
  rubricVersion: 'podcast-v1',
};

const { runEpisodeIntel } = await import('./index.js');

const PASS: ComplianceVerdict = { passes: true, flags: [], rationale: 'Described neutrally.', suggested_rewrite: null };
const FLAG: ComplianceVerdict = {
  passes: false,
  flags: [{ quote: 'a buying opportunity', issue: 'reads as a buy signal' }],
  rationale: 'Advice framing.',
  suggested_rewrite: 'the host described the market context.',
};

function availableEpisode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ep-1',
    title: 'Custody in 2026',
    description: 'Cold storage chat.',
    transcript_text: 'GUEST: multisig matters and here is a long discussion.',
    transcript_status: 'available',
    ...overrides,
  };
}

function updateCallFor(table: string): Record<string, unknown> | undefined {
  const builder = fakeSupabase.__buildersFor(table).find((b) => b.update.mock.calls.length > 0);
  return builder?.update.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
}

function activityInserts(): Record<string, unknown>[] {
  return fakeSupabase
    .__buildersFor('agent_activity')
    .flatMap((b) => b.insert.mock.calls.flatMap((c) => c[0] as Record<string, unknown>[]));
}

beforeEach(() => {
  rogerGenerate.mockReset();
  lexGenerate.mockReset();
  scoreEpisodeRelevance.mockReset();
  scoreEpisodeRelevance.mockResolvedValue(SCORE);
  fakeSupabase.from.mockClear();
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  rogerGenerate.mockResolvedValue({
    object: {
      summary: 'The host argued custody is a board decision.',
      // 88 snaps to the 90s segment start below.
      takeaways: [{ text: 'Custody is a board decision.', start_seconds: 88 }],
    },
  });
  lexGenerate.mockResolvedValue({ object: PASS });
  fakeSupabase.__setResponse('transcript_segments', {
    data: [
      { start_seconds: 0, speaker: 'HOST', content: 'Intro.' },
      { start_seconds: 90, speaker: 'GUEST', content: 'Custody is a board decision.' },
    ],
    error: null,
  });
  fakeSupabase.__setResponse('agent_activity', { data: null, error: null });
});

describe('runEpisodeIntel', () => {
  it('narrates, reviews, and persists a proposed summary with a passing verdict', async () => {
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: availableEpisode(), error: null }, // select
      { data: null, error: null }, // update
    ]);

    await runEpisodeIntel('ep-1');

    expect(rogerGenerate).toHaveBeenCalledOnce();
    expect(lexGenerate).toHaveBeenCalledOnce();

    const update = updateCallFor('podcast_episodes');
    expect(update).toMatchObject({
      episode_summary: 'The host argued custody is a board decision.',
      // The proposed 88s snaps to the real 90s segment start.
      key_takeaways: [{ text: 'Custody is a board decision.', start_seconds: 90 }],
      summary_status: 'proposed',
      summary_lex_verdict: PASS,
      relevance_score: 0.78,
      category: 'macro',
      relevance_metadata: {
        dimension_scores: { material: 0.8, novelty: 0.7, citation: 0.8 },
        rubric_version: 'podcast-v1',
      },
    });
    expect(update?.summary_generated_at).toEqual(expect.any(String));
    // Relevance is scored from the brief (summary + takeaway texts), not the transcript.
    expect(scoreEpisodeRelevance).toHaveBeenCalledWith({
      title: 'Custody in 2026',
      summary: 'The host argued custody is a board decision.',
      takeaways: ['Custody is a board decision.'],
    });

    const inserts = activityInserts();
    expect(inserts).toEqual([
      expect.objectContaining({ agent_name: 'roger', action: 'episode_summarized', status: 'pending', entity_id: 'ep-1' }),
      expect.objectContaining({ agent_name: 'lex', status: 'auto', entity_type: 'podcast_episodes', entity_id: 'ep-1' }),
    ]);
  });

  it('logs Lex as pending and surfaces flags when the summary is flagged', async () => {
    lexGenerate.mockResolvedValue({ object: FLAG });
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: availableEpisode(), error: null },
      { data: null, error: null },
    ]);

    await runEpisodeIntel('ep-1');

    // Publish-wall holds it regardless of the verdict — it persists as proposed.
    expect(updateCallFor('podcast_episodes')).toMatchObject({ summary_status: 'proposed', summary_lex_verdict: FLAG });
    const lexRow = activityInserts().find((r) => r.agent_name === 'lex');
    expect(lexRow).toMatchObject({ status: 'pending' });
    expect(lexRow?.notes).toContain('a buying opportunity');
    expect(lexRow?.proposed_actions).toEqual([{ kind: 'suggested_rewrite', body: FLAG.suggested_rewrite }]);
  });

  it('does nothing when the episode has no available transcript', async () => {
    fakeSupabase.__setResponse('podcast_episodes', {
      data: availableEpisode({ transcript_status: 'skipped', transcript_text: null }),
      error: null,
    });

    await runEpisodeIntel('ep-1');

    expect(rogerGenerate).not.toHaveBeenCalled();
    expect(updateCallFor('podcast_episodes')).toBeUndefined();
  });

  it('persists null relevance when scoring fails, without blocking the summary', async () => {
    scoreEpisodeRelevance.mockResolvedValue(null);
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: availableEpisode(), error: null },
      { data: null, error: null },
    ]);

    await runEpisodeIntel('ep-1');

    expect(updateCallFor('podcast_episodes')).toMatchObject({
      summary_status: 'proposed',
      relevance_score: null,
      category: null,
      relevance_metadata: null,
    });
  });

  it('nulls takeaway timestamps when the transcript has no segments to anchor to', async () => {
    fakeSupabase.__setResponse('transcript_segments', { data: [], error: null });
    rogerGenerate.mockResolvedValue({
      object: { summary: 'A neutral brief.', takeaways: [{ text: 'A point.', start_seconds: 42 }] },
    });
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: availableEpisode(), error: null },
      { data: null, error: null },
    ]);

    await runEpisodeIntel('ep-1');

    expect(updateCallFor('podcast_episodes')).toMatchObject({
      key_takeaways: [{ text: 'A point.', start_seconds: null }],
    });
  });

  it('fails safe (Lex pending) when the compliance call throws', async () => {
    lexGenerate.mockRejectedValue(new Error('LLM down'));
    fakeSupabase.__setResponses('podcast_episodes', [
      { data: availableEpisode(), error: null },
      { data: null, error: null },
    ]);

    await runEpisodeIntel('ep-1');

    const update = updateCallFor('podcast_episodes');
    expect(update).toMatchObject({ summary_status: 'proposed' });
    expect((update?.summary_lex_verdict as ComplianceVerdict).passes).toBe(false);
    expect(activityInserts().find((r) => r.agent_name === 'lex')).toMatchObject({ status: 'pending' });
  });
});
