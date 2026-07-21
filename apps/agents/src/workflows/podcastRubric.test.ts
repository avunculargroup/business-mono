import { describe, it, expect } from 'vitest';
import {
  buildEpisodeRubricPrompt,
  podcastRubricOutputSchema,
  PODCAST_RUBRIC_VERSION,
} from './podcastRubric.js';
import { composeRelevanceScore } from './newsRubric.js';

describe('buildEpisodeRubricPrompt', () => {
  it('renders title, summary, and takeaways as the brief to score', () => {
    const p = buildEpisodeRubricPrompt({
      title: 'Custody in 2026',
      summary: 'The host argued custody is a board decision.',
      takeaways: ['Multisig lowers single-point risk.', 'Insurers now ask for it.'],
    });
    expect(p).toContain('Custody in 2026');
    expect(p).toContain('The host argued custody is a board decision.');
    expect(p).toContain('- Multisig lowers single-point risk.');
    expect(p).toContain('- Insurers now ask for it.');
  });

  it('omits the takeaways block when there are none', () => {
    const p = buildEpisodeRubricPrompt({ title: 'T', summary: 'S', takeaways: [] });
    expect(p).not.toContain('KEY TAKEAWAYS:');
  });
});

describe('podcastRubricOutputSchema', () => {
  it('accepts a well-formed rubric object with a category', () => {
    const parsed = podcastRubricOutputSchema.parse({
      dimension_scores: { material: 0.8, novelty: 0.7, citation: 0.8 },
      category: 'macro',
      relevance_reasoning: 'Material macro thesis, familiar framing.',
      flags: [],
    });
    expect(parsed.category).toBe('macro');
    // The composite reuses the shared news-rubric weighting (0.5/0.3/0.2).
    expect(composeRelevanceScore(parsed.dimension_scores)).toBe(0.77);
  });

  it('rejects a category outside the four NewsCategory values', () => {
    expect(() =>
      podcastRubricOutputSchema.parse({
        dimension_scores: { material: 0.5, novelty: 0.5, citation: 0.5 },
        category: 'altcoins',
        relevance_reasoning: 'x',
        flags: [],
      }),
    ).toThrow();
  });
});

describe('PODCAST_RUBRIC_VERSION', () => {
  it('is the forked podcast version, distinct from the news rubric', () => {
    expect(PODCAST_RUBRIC_VERSION).toBe('podcast-v1');
  });
});
