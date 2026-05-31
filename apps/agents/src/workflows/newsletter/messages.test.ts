import { describe, it, expect } from 'vitest';
import { buildGate1Message, buildGate2Message, buildConfirmationMessage } from './messages.js';
import type { StoryCandidate, ReviewedStory } from './schemas.js';

function candidate(id: string, title: string, completeness = 6, needsResearch = false): StoryCandidate {
  return {
    story_id: id,
    working_title: title,
    angle: `Angle for ${title}`,
    key_points: [],
    source_ids: [],
    relevance_score: 8,
    data_completeness: completeness,
    needs_research: needsResearch,
    rex_rationale: '',
  };
}

function reviewed(id: string, title: string, score: number, passes = true): ReviewedStory {
  return {
    story_id: id,
    title,
    body: 'body',
    word_count: 250,
    review: {
      story_id: id,
      scores: {
        voice_match: passes ? 8 : 5,
        audience_fit: 8,
        bitcoin_accuracy: 9,
        clarity: 8,
        evidence_quality: 7,
        length_discipline: 8,
      },
      overall_score: score,
      passes_gate: passes,
      critique: '',
      editor_note: '',
    },
  };
}

describe('buildGate1Message', () => {
  it('numbers recommended stories and letters the alternates', () => {
    const candidates = [candidate('1', 'A'), candidate('2', 'B'), candidate('3', 'C')];
    const msg = buildGate1Message({
      candidates,
      recommendedIds: ['1', '2'],
      timeRange: 'month',
    });
    expect(msg).toContain('RECOMMENDED (2 stories)');
    expect(msg).toContain('1. A');
    expect(msg).toContain('2. B');
    expect(msg).toContain('ALSO AVAILABLE');
    expect(msg).toContain('A. C — Angle for C');
    expect(msg).toContain('Reply "go" to approve');
  });
});

describe('buildGate2Message', () => {
  it('renders the scorecard and flags failed/over-length stories', () => {
    const stories = [reviewed('1', 'A', 8), reviewed('2', 'B', 5, false)];
    const msg = buildGate2Message({
      stories,
      totalWordCount: 500,
      timeRange: 'month',
      overLengthIds: [],
    });
    expect(msg).toContain('~500 words');
    expect(msg).toContain('Story 1 "A" — 8/10');
    expect(msg).toContain('Story 2 "B" — 5/10 ⚠️');
    expect(msg).toContain('"publish"');
  });

  it('switches the heading when held', () => {
    const msg = buildGate2Message({
      stories: [reviewed('1', 'A', 8)],
      totalWordCount: 250,
      timeRange: 'week',
      overLengthIds: [],
      held: true,
    });
    expect(msg).toContain('on hold');
  });
});

describe('buildConfirmationMessage', () => {
  it('includes the title, counts, and a deep link', () => {
    const msg = buildConfirmationMessage({
      title: 'BTS Newsletter — May 2026',
      storyCount: 5,
      totalWordCount: 1200,
      hqUrl: 'https://hq.example',
      contentItemId: 'abc-123',
    });
    expect(msg).toContain('"BTS Newsletter — May 2026" — 5 stories, 1200 words');
    expect(msg).toContain('https://hq.example/content/abc-123');
  });
});
