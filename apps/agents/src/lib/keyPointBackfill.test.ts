import { describe, it, expect } from 'vitest';
import { emptyAsOfTally, hasLegacyKeyPoints, normalizeRowAsOf, tallyAsOf, tallyKinds } from './keyPointBackfill.js';

describe('hasLegacyKeyPoints', () => {
  it('flags rows holding bare strings', () => {
    expect(hasLegacyKeyPoints(['a', 'b'])).toBe(true);
    expect(hasLegacyKeyPoints([{ text: 'a', kind: 'new' }, 'b'])).toBe(true);
  });

  it('skips rows already structured, empty, or not an array', () => {
    expect(hasLegacyKeyPoints([{ text: 'a', kind: 'background' }])).toBe(false);
    expect(hasLegacyKeyPoints([])).toBe(false);
    expect(hasLegacyKeyPoints(null)).toBe(false);
  });
});

describe('tallyKinds', () => {
  it('counts points by kind', () => {
    const tally = tallyKinds(
      [{ kind: 'new' }, { kind: 'background' }, { kind: 'background' }],
      { new: 0, background: 0, opinion: 1 },
    );
    expect(tally).toEqual({ new: 1, background: 2, opinion: 1 });
  });
});

describe('normalizeRowAsOf', () => {
  const PUBLISHED = '2026-11-17T18:52:35Z'; // 2026-11-18 in Melbourne

  it('rewrites the 17 Nov roundup row: new points get the publication date, the background keeps a valid past date', () => {
    const raw = [
      { text: 'The RBA lifted the cash rate to 4.85%', kind: 'background', asOf: '2023-11-07' },
      { text: 'CBA overtook BHP', kind: 'new', asOf: '2023-11-07' },
    ];
    const { keyPoints, changes } = normalizeRowAsOf(raw, PUBLISHED);
    expect(keyPoints).toEqual([
      raw[0],
      { text: 'CBA overtook BHP', kind: 'new', asOf: '2026-11-18' },
    ]);
    expect(changes).toEqual(['new_stamped']);
  });

  it('nulls free text and future dates, and says which', () => {
    const { keyPoints, changes } = normalizeRowAsOf(
      [
        { text: 'a', kind: 'background', asOf: 'present' },
        { text: 'b', kind: 'opinion', asOf: '2027-03' },
        { text: 'c', kind: 'background', asOf: '' },
      ],
      PUBLISHED,
    );
    expect((keyPoints as Array<{ asOf: unknown }>).map((p) => p.asOf)).toEqual([null, null, '']);
    expect(changes).toEqual(['invalid_nulled', 'future_nulled']);
  });

  it('leaves a row that is already right, bare strings and unknown entries untouched', () => {
    const raw = ['legacy', { text: 'a', kind: 'new', asOf: '2026-11-18' }, { text: 'b', kind: 'background' }, 42];
    const { keyPoints, changes } = normalizeRowAsOf(raw, PUBLISHED);
    expect(keyPoints).toEqual(raw);
    expect(changes).toEqual([]);
  });

  it('tallies rows and reasons', () => {
    const t = emptyAsOfTally();
    tallyAsOf(['new_stamped', 'invalid_nulled'], 4, t);
    tallyAsOf([], 3, t);
    expect(t).toEqual({ rowsScanned: 2, rowsChanged: 1, points: 7, new_stamped: 1, invalid_nulled: 1, future_nulled: 0 });
  });
});
