import { describe, it, expect } from 'vitest';
import { hasLegacyKeyPoints, tallyKinds } from './keyPointBackfill.js';

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
