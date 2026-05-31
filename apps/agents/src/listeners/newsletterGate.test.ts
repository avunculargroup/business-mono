import { describe, it, expect } from 'vitest';
import { parseGate1Reply, parseGate2Reply } from './newsletterGate.js';

describe('parseGate1Reply', () => {
  it.each(['go', 'GO', 'approve', 'looks good', 'yes please', '👍'])(
    'treats "%s" as approval',
    (text) => {
      expect(parseGate1Reply(text)).toEqual({ decision: 'approve' });
    },
  );

  it('treats anything else as an adjustment carrying the full text', () => {
    expect(parseGate1Reply('swap 3 for B, more on regulation')).toEqual({
      decision: 'adjust',
      adjustment: 'swap 3 for B, more on regulation',
    });
  });
});

describe('parseGate2Reply', () => {
  it.each(['publish', 'approve', 'send it'])('treats "%s" as publish', (text) => {
    expect(parseGate2Reply(text)).toEqual({ decision: 'publish' });
  });

  it('parses a revise command into story number + instruction', () => {
    expect(parseGate2Reply('revise 2: tighten the opening line')).toEqual({
      decision: 'revise',
      storyNumber: 2,
      instruction: 'tighten the opening line',
    });
  });

  it('parses revise without a colon', () => {
    expect(parseGate2Reply('revise 1 add a CFO angle')).toEqual({
      decision: 'revise',
      storyNumber: 1,
      instruction: 'add a CFO angle',
    });
  });

  it('treats "hold" as hold', () => {
    expect(parseGate2Reply('hold')).toEqual({ decision: 'hold' });
  });

  it('defaults ambiguous replies to hold so nothing publishes by accident', () => {
    expect(parseGate2Reply('hmm not sure about story 3')).toEqual({ decision: 'hold' });
  });
});
