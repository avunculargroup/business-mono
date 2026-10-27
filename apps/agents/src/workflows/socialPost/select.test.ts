import { describe, it, expect } from 'vitest';
import { mapNewsRowToCandidate, resolveSelection, type StoryCandidate } from './select.js';

function candidate(n: number): StoryCandidate {
  return {
    id: `news-${n}`,
    title: `Story ${n}`,
    url: `https://news.example.com/${n}`,
    summary: `Summary ${n}`,
    source_name: `Source ${n}`,
    category: 'regulatory',
    key_points: [],
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

  it('tolerates null/missing fields', () => {
    const c = mapNewsRowToCandidate({ id: 'n2', title: 'T', url: 'https://x/2' });
    expect(c.summary).toBe('');
    expect(c.source_name).toBe('News');
    expect(c.key_points).toEqual([]);
    expect(c.topic_tags).toEqual([]);
    expect(c.relevance_score).toBeNull();
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
