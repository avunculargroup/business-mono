import { describe, it, expect } from 'vitest';
import {
  buildStrategyPrompt,
  buildBeatPlanPrompt,
  buildResearchPrompt,
  buildAudiencePrompt,
  formatPriorLearnings,
  shouldRunResearch,
  shouldRunAudienceAnalysis,
} from './prompts.js';
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
    researchBrief: '',
    audienceAnalysis: '',
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

describe('shouldRunResearch', () => {
  it('triggers on current-events / competitor / trend signals', () => {
    expect(shouldRunResearch('Respond to the latest ASIC regulatory guidance')).toBe(true);
    expect(shouldRunResearch('How we compare to competitors on custody')).toBe(true);
    expect(shouldRunResearch('Ride the current market narrative')).toBe(true);
  });
  it('triggers on a recent year reference', () => {
    expect(shouldRunResearch('Our 2026 treasury thesis')).toBe(true);
  });
  it('skips an evergreen, internal objective', () => {
    expect(shouldRunResearch('Explain why volatility is not risk on a treasury horizon')).toBe(false);
  });
});

describe('shouldRunAudienceAnalysis', () => {
  it('runs when an industry or pipeline stage is set', () => {
    expect(shouldRunAudienceAnalysis({ industry: ['Asset Management'] })).toBe(true);
    expect(shouldRunAudienceAnalysis({ pipeline_stage: ['warm'] })).toBe(true);
  });
  it('skips an empty or filter-less segment', () => {
    expect(shouldRunAudienceAnalysis({})).toBe(false);
    expect(shouldRunAudienceAnalysis({ industry: [], pipeline_stage: [] })).toBe(false);
    expect(shouldRunAudienceAnalysis({ bitcoin_literacy_min: 'intermediate' })).toBe(false);
  });
});

describe('buildResearchPrompt', () => {
  it('asks Rex for a tight, recommendation-free brief on the objective', () => {
    const prompt = buildResearchPrompt(makeCtx());
    expect(prompt).toContain('Reframe volatility as not the same as risk');
    expect(prompt).toContain('No hype, no price predictions');
  });
});

describe('buildAudiencePrompt', () => {
  it('includes the filter, persona, and any CRM company names', () => {
    const prompt = buildAudiencePrompt(makeCtx(), ['Acme Capital', 'Beta Family Office']);
    expect(prompt).toContain('industry: Asset Management');
    expect(prompt).toContain('AU CFOs at family offices.');
    expect(prompt).toContain('Acme Capital, Beta Family Office');
  });
});

describe('branch output in the synthesis prompt', () => {
  it('folds in the research brief and audience analysis when present', () => {
    const prompt = buildStrategyPrompt(
      makeCtx({ researchBrief: '- ASIC issued new guidance', audienceAnalysis: '- CFOs fear volatility' }),
    );
    expect(prompt).toContain('Research brief (Rex)');
    expect(prompt).toContain('ASIC issued new guidance');
    expect(prompt).toContain('Audience analysis (Bruno)');
    expect(prompt).toContain('CFOs fear volatility');
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
