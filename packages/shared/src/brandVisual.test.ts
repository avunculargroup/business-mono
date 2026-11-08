import { describe, it, expect } from 'vitest';
import { nextBrandVisualVersion, planCandidateSelection } from './brandVisual.js';

// buildImagePrompt and lintImageBrief are covered against the seeded canon in
// apps/agents (imagePrompt.test.ts, imageBrief.test.ts), where the fixture lives.

describe('nextBrandVisualVersion', () => {
  it('bumps the minor version numerically', () => {
    expect(nextBrandVisualVersion('1.0')).toBe('1.1');
    expect(nextBrandVisualVersion('1.9')).toBe('1.10');
    expect(nextBrandVisualVersion(' 2.3 ')).toBe('2.4');
  });

  it('restarts a malformed version at 1.0', () => {
    expect(nextBrandVisualVersion('v1')).toBe('1.0');
  });
});

describe('planCandidateSelection', () => {
  const rows = [
    { id: 'a-li', generation_group_id: 'a', review_outcome: null },
    { id: 'a-x', generation_group_id: 'a', review_outcome: null },
    { id: 'b-li', generation_group_id: 'b', review_outcome: 'not_chosen' },
    { id: 'c-li', generation_group_id: 'c', review_outcome: 'removed' },
    { id: 'd-li', generation_group_id: 'd', review_outcome: 'kept' },
  ];

  it('selects every row of the chosen group and clears every other live row', () => {
    expect(planCandidateSelection(rows, 'b')).toEqual({ onIds: ['b-li'], offIds: ['a-li', 'a-x', 'd-li'] });
  });

  it('never touches a removed or regenerated row', () => {
    expect(planCandidateSelection(rows, 'a').offIds).not.toContain('c-li');
  });

  it('selects nothing for a group that is not in the set', () => {
    expect(planCandidateSelection(rows, 'z').onIds).toEqual([]);
  });
});
