import { describe, it, expect } from 'vitest';
import { buildStrategyPrompt, buildBeatPlanPrompt, formatPriorLearnings } from './prompts.js';
import type { StrategyContext, StrategyObject } from './schemas.js';

function makeCtx(overrides: Partial<StrategyContext> = {}): StrategyContext {
  return {
    campaignId: '00000000-0000-0000-0000-000000000001',
    name: 'Treasury volatility',
    objective: 'Reframe volatility as not the same as risk on a treasury horizon.',
    audienceFilter: { industry: ['Asset Management'], bitcoin_literacy_min: 'intermediate' },
    audiencePersona: 'AU CFOs at family offices.',
    voiceBlock: '**Persona:** plain, confident advisor',
    priorLearnings: '',
    accounts: [
      { id: 'a1', platform: 'linkedin', display_name: 'BTS — Company' },
      { id: 'a2', platform: 'twitter_x', display_name: 'Chris (X)' },
    ],
    postSlots: [{ day: 'TU', time: '09:00', label: 'Tue am' }],
    postsPerWeek: 4,
    durationWeeks: 2,
    startDate: '2026-07-07',
    ...overrides,
  };
}

const strategy: StrategyObject = {
  content_pillars: ['Treasury risk reframed'],
  key_messages: ['Volatility is not risk on a multi-year horizon'],
  audience_summary: 'AU CFOs.',
  tone_guidance: 'Credible, calm.',
  hooks: ['Open with a balance-sheet number'],
  hashtags: ['#corporatetreasury'],
  do_not_say: ['price predictions'],
  success_signals: ['inbound DMs'],
};

describe('buildStrategyPrompt', () => {
  it('includes the objective, audience, voice block, and the strategy fields', () => {
    const prompt = buildStrategyPrompt(makeCtx());
    expect(prompt).toContain('Reframe volatility as not the same as risk');
    expect(prompt).toContain('industry: Asset Management');
    expect(prompt).toContain('AU CFOs at family offices.');
    expect(prompt).toContain('plain, confident advisor');
    expect(prompt).toContain('content_pillars');
    expect(prompt).toContain('do_not_say');
    expect(prompt).toContain('No exclamation marks');
  });

  it('falls back to a stance note when the voice block is missing', () => {
    const prompt = buildStrategyPrompt(makeCtx({ voiceBlock: null }));
    expect(prompt).toContain('brand voice not available');
  });

  it('includes the requested change when regenerating', () => {
    const prompt = buildStrategyPrompt(makeCtx(), 'Sharpen the pillars.');
    expect(prompt).toContain('Requested change');
    expect(prompt).toContain('Sharpen the pillars.');
  });
});

describe('buildBeatPlanPrompt', () => {
  it('includes the approved strategy, accounts, cadence, and a beat target', () => {
    const prompt = buildBeatPlanPrompt(makeCtx(), strategy);
    expect(prompt).toContain('Volatility is not risk on a multi-year horizon');
    expect(prompt).toContain('BTS — Company (linkedin)');
    expect(prompt).toContain('Chris (X) (twitter_x)');
    expect(prompt).toContain('Posts per week (total across accounts): 4');
    expect(prompt).toContain('Duration: 2 weeks');
    // total posts 8 ÷ 2 accounts ≈ 4 beats
    expect(prompt).toContain('roughly 4 beats');
    expect(prompt).toContain('prefer_thread');
  });

  it('passes the regeneration instruction through', () => {
    const prompt = buildBeatPlanPrompt(makeCtx(), strategy, 'Reorder so the strongest beat opens.');
    expect(prompt).toContain('Requested change');
    expect(prompt).toContain('Reorder so the strongest beat opens.');
  });
});

describe('formatPriorLearnings', () => {
  it('returns empty string when there are no prior posts', () => {
    expect(formatPriorLearnings([])).toBe('');
  });

  it('lists titles with available metrics', () => {
    const out = formatPriorLearnings([
      { title: 'Why horizon matters', type: 'linkedin', impressions: 1200, reactions: 30 },
      { title: null, type: 'twitter_x', impressions: null, reactions: null },
    ]);
    expect(out).toContain('Why horizon matters (linkedin) — 1200 impressions, 30 reactions');
    expect(out).toContain('(untitled) (twitter_x)');
  });
});
