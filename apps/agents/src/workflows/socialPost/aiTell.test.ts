import { describe, it, expect } from 'vitest';
import { scoreAiTells, aiTellRewriteInstruction, AI_TELL_THRESHOLD } from './aiTell.js';

const OFFENDER = `Is Bitcoin really the answer?
In today's landscape, Bitcoin is not just an asset but a strategy — resilient, scarce, and proven — for every CFO.
#Bitcoin #Treasury #CFO #Finance`;

const CLEAN = `The RBA held the cash rate at 4.35% today.
That keeps real yields negative for anyone parking excess cash.`;

describe('scoreAiTells', () => {
  it('scores an offender above the threshold and detects each tell', () => {
    const flags = scoreAiTells(OFFENDER);
    expect(flags.questionOpener).toBe(true);
    expect(flags.emDashes).toBeGreaterThanOrEqual(2);
    expect(flags.ruleOfThreeLists).toBeGreaterThanOrEqual(1);
    expect(flags.notJustButX).toBeGreaterThanOrEqual(1);
    expect(flags.stockPhrases).toContain("in today's landscape");
    expect(flags.hashtags).toBe(4);
    expect(flags.score).toBeGreaterThanOrEqual(AI_TELL_THRESHOLD);
  });

  it('scores a clean, grounded post below the threshold', () => {
    const flags = scoreAiTells(CLEAN, { storyHasNumbers: true });
    expect(flags.lacksConcreteSpecific).toBe(false); // has "4.35%"
    expect(flags.score).toBeLessThan(AI_TELL_THRESHOLD);
  });

  it('flags an ungrounded post only when the story carried figures', () => {
    const vague = 'Many Australian businesses are exploring new treasury options right now.';
    expect(scoreAiTells(vague, { storyHasNumbers: true }).lacksConcreteSpecific).toBe(true);
    expect(scoreAiTells(vague, { storyHasNumbers: false }).lacksConcreteSpecific).toBe(false);
    // Grounding is weighted to trip on its own.
    expect(scoreAiTells(vague, { storyHasNumbers: true }).score).toBeGreaterThanOrEqual(AI_TELL_THRESHOLD);
  });

  it('does not penalise a single em-dash', () => {
    expect(scoreAiTells('One clean line — with a single dash and the figure 42.').emDashes).toBe(1);
    expect(scoreAiTells('One clean line — with a single dash and the figure 42.').score).toBeLessThan(AI_TELL_THRESHOLD);
  });
});

describe('aiTellRewriteInstruction', () => {
  it('returns null for a clean draft', () => {
    expect(aiTellRewriteInstruction(scoreAiTells(CLEAN, { storyHasNumbers: true }))).toBeNull();
  });

  it('names the offenders present for a tripped draft', () => {
    const instruction = aiTellRewriteInstruction(scoreAiTells(OFFENDER));
    expect(instruction).not.toBeNull();
    expect(instruction).toMatch(/em-dash/i);
    expect(instruction).toMatch(/rule-of-three/i);
    expect(instruction).toMatch(/not just X but Y/i);
    expect(instruction).toMatch(/rhetorical question/i);
    expect(instruction).toMatch(/stock filler/i);
    expect(instruction).toMatch(/hashtags/i);
  });

  it('asks for a concrete anchor when grounding failed', () => {
    const instruction = aiTellRewriteInstruction(
      scoreAiTells('A vague post with no figures at all.', { storyHasNumbers: true }),
    );
    expect(instruction).toMatch(/concrete specific/i);
  });
});
