import { describe, it, expect } from 'vitest';
import type { KeyPoint } from '@platform/shared';
import { backgroundClassifiedScorer, introOmitsFactScorer } from './backgroundFact.js';

const groundTruth = { factPattern: '4\\.60?\\s?%' };

async function classified(points: KeyPoint[]): Promise<number> {
  return (await backgroundClassifiedScorer.run({ output: points, groundTruth })).score as number;
}

async function omits(intro: string): Promise<number> {
  return (await introOmitsFactScorer.run({ output: intro, groundTruth })).score as number;
}

describe('backgroundClassifiedScorer', () => {
  it('scores 1 when the fact is extracted as background', async () => {
    expect(await classified([
      { text: 'The RBA raised the cash rate by 25 bp to 4.60%.', kind: 'background' },
      { text: 'Commentary has been inconsistent.', kind: 'new' },
    ])).toBe(1);
  });

  it('scores 0 when the fact is extracted as new', async () => {
    expect(await classified([{ text: 'The RBA raised the cash rate to 4.6%.', kind: 'new' }])).toBe(0);
  });

  it('scores 0 when any of several mentions is not background', async () => {
    expect(await classified([
      { text: 'Rate lifted to 4.60%.', kind: 'background' },
      { text: 'The cash rate is 4.60%.', kind: 'new' },
    ])).toBe(0);
  });

  it('scores 0 when the fact was not extracted at all', async () => {
    expect(await classified([{ text: 'Commentary has been inconsistent.', kind: 'new' }])).toBe(0);
  });
});

describe('introOmitsFactScorer', () => {
  it('scores 0 for the intro that went out on 25 Oct', async () => {
    expect(await omits('The RBA raised the cash rate to 4.60% and rising US 30-year yields are raising the opportunity cost for treasurers.')).toBe(0);
  });

  it('scores 1 for an intro that reports only the new development', async () => {
    expect(await omits('Inconsistent RBA commentary has driven wide swings in rate expectations.')).toBe(1);
  });

  it('scores 0 for an empty intro, which proves nothing', async () => {
    expect(await omits('')).toBe(0);
  });
});
