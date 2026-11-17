import { describe, it, expect } from 'vitest';
import { isHookEligible, mapNewsRowToCandidate, resolveSelection, type StoryCandidate } from './select.js';

function candidate(n: number): StoryCandidate {
  return {
    id: `news-${n}`,
    title: `Story ${n}`,
    url: `https://news.example.com/${n}`,
    summary: `Summary ${n}`,
    source_name: `Source ${n}`,
    category: 'regulatory',
    key_points: [],
    new_points: [],
    context_points: [],
    topic_tags: [],
    relevance_score: 0.9 - n * 0.1,
    published_at: '2026-06-26T06:00:00Z',
  };
}

describe('mapNewsRowToCandidate', () => {
  it('maps a full row', () => {
    const c = mapNewsRowToCandidate({
      id: 'n1',
      title: 'T',
      url: 'https://x/1',
      summary: 'S',
      source_name: 'Src',
      category: 'corporate',
      key_points: ['a', 'b'],
      topic_tags: ['treasury'],
      relevance_score: 0.8,
      published_at: '2026-06-26T00:00:00Z',
    });
    expect(c).toMatchObject({ id: 'n1', source_name: 'Src', category: 'corporate', key_points: ['a', 'b'] });
  });

  it('labels background and opinion key points so the post cannot present them as news', () => {
    const c = mapNewsRowToCandidate({
      id: 'n3',
      title: 'T',
      url: 'https://x/3',
      key_points: [
        { text: 'RBA raised the cash rate to 4.60%', kind: 'background', asOf: '2026-09-30' },
        { text: 'Guidance has been inconsistent', kind: 'new' },
        { text: 'Another hike is likely', kind: 'opinion' },
      ],
    });
    expect(c.key_points).toEqual([
      '[background, as of 2026-09-30] RBA raised the cash rate to 4.60%',
      'Guidance has been inconsistent',
      '[opinion] Another hike is likely',
    ]);
  });

  it('splits new points from context, and validates asOf against published_at', () => {
    // The shape of the 17 Nov Fear & Greed item: model-invented asOf on every point.
    const c = mapNewsRowToCandidate({
      id: 'n4',
      title: 'T',
      url: 'https://x/4',
      published_at: '2026-11-17T18:52:35Z',
      key_points: [
        { text: 'The RBA lifted the cash rate to 4.85% in a 6–3 vote', kind: 'background', asOf: '2023-11-07' },
        { text: 'Minutes show three members dissented', kind: 'new', asOf: 'present' },
        { text: 'Rates may stay on hold', kind: 'opinion', asOf: '2026-12' },
      ],
    });
    expect(c.new_points).toEqual(['Minutes show three members dissented']);
    // 2023-11-07 is a valid date before publication, so it survives — but it is
    // only ever context. A future month does not survive.
    expect(c.context_points).toEqual([
      '[background, as of 2023-11-07] The RBA lifted the cash rate to 4.85% in a 6–3 vote',
      '[opinion] Rates may stay on hold',
    ]);
    expect(c.key_points.join(' ')).not.toContain('present');
  });

  it('tolerates null/missing fields', () => {
    const c = mapNewsRowToCandidate({ id: 'n2', title: 'T', url: 'https://x/2' });
    expect(c.summary).toBe('');
    expect(c.source_name).toBe('News');
    expect(c.key_points).toEqual([]);
    expect(c.new_points).toEqual([]);
    expect(c.topic_tags).toEqual([]);
    expect(c.relevance_score).toBeNull();
  });
});

describe('isHookEligible', () => {
  it('admits a story only when it has a new point', () => {
    expect(isHookEligible({ ...candidate(0), new_points: ['Minutes reveal the dissent'] })).toBe(true);
    expect(isHookEligible({ ...candidate(0), context_points: ['[background] 6–3 vote'] })).toBe(false);
  });
});

describe('resolveSelection', () => {
  const candidates = [candidate(0), candidate(1), candidate(2)];

  it('honours an in-range editor pick', () => {
    const res = resolveSelection(candidates, { story_index: 2, form: 'teach', rationale: 'fits' });
    expect(res.story.id).toBe('news-2');
    expect(res.form).toBe('teach');
    expect(res.rationale).toBe('fits');
  });

  it('falls back to the top-ranked story when the pick is out of range', () => {
    const res = resolveSelection(candidates, { story_index: 9, form: 'teach', rationale: 'x' });
    expect(res.story.id).toBe('news-0');
    expect(res.form).toBe('share_with_context');
  });

  it('falls back when the editor produced nothing', () => {
    const res = resolveSelection(candidates, null);
    expect(res.story.id).toBe('news-0');
    expect(res.form).toBe('share_with_context');
  });
});
