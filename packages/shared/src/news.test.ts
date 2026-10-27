import { describe, it, expect } from 'vitest';
import { formatKeyPointsForPrompt, newKeyPoints, normalizeKeyPoints } from './news.js';

describe('normalizeKeyPoints', () => {
  it('reads legacy bare strings as new, so un-backfilled rows behave as before', () => {
    expect(normalizeKeyPoints(['a', 'b'])).toEqual([
      { text: 'a', kind: 'new' },
      { text: 'b', kind: 'new' },
    ]);
  });

  it('keeps structured points and their asOf', () => {
    expect(
      normalizeKeyPoints([
        { text: 'RBA raised to 4.60%', kind: 'background', asOf: '2026-09-30' },
        { text: 'Guidance inconsistent', kind: 'new' },
      ]),
    ).toEqual([
      { text: 'RBA raised to 4.60%', kind: 'background', asOf: '2026-09-30' },
      { text: 'Guidance inconsistent', kind: 'new' },
    ]);
  });

  it('drops entries it cannot classify rather than guessing', () => {
    expect(
      normalizeKeyPoints([null, '', '  ', 3, { text: 'x', kind: 'rumour' }, { kind: 'new' }, { text: 'ok', kind: 'opinion' }]),
    ).toEqual([{ text: 'ok', kind: 'opinion' }]);
  });

  it('returns [] for a non-array', () => {
    expect(normalizeKeyPoints(null)).toEqual([]);
    expect(normalizeKeyPoints({ text: 'a', kind: 'new' })).toEqual([]);
  });
});

describe('newKeyPoints', () => {
  it('keeps only the points the article itself reports', () => {
    const points = normalizeKeyPoints([
      { text: 'bg', kind: 'background' },
      { text: 'fresh', kind: 'new' },
      { text: 'view', kind: 'opinion' },
    ]);
    expect(newKeyPoints(points).map((p) => p.text)).toEqual(['fresh']);
  });
});

describe('formatKeyPointsForPrompt', () => {
  it('labels non-new points with their kind and date', () => {
    expect(
      formatKeyPointsForPrompt([
        { text: 'fresh', kind: 'new' },
        { text: 'bg', kind: 'background', asOf: '2026-09' },
        { text: 'view', kind: 'opinion' },
      ]),
    ).toEqual(['fresh', '[background, as of 2026-09] bg', '[opinion] view']);
  });
});
