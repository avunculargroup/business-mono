import { describe, it, expect } from 'vitest';
import { buildCommentaryPrompt, type HistoryMap } from './marketCommentary.js';
import type { MarketReportSection } from '@platform/shared';

const sections: MarketReportSection[] = [
  {
    heading: 'On-chain',
    items: [
      { label: 'Hash Ribbons', value: '3.20', signal: 'neutral', delta: null, as_of: '2026-07-03' },
      { label: 'Hash Rate', value: '915.00 EH/s', signal: null, delta: '▲ +7.00 (+0.77%) on prior', as_of: '2026-07-03' },
    ],
  },
  {
    heading: 'Macro',
    items: [
      { label: 'US 10Y', value: '3.85 %', signal: null, delta: '▼ −0.03 (−0.77%) on prior', as_of: '2026-07-02' },
    ],
  },
];

const history: HistoryMap = {
  'Hash Rate': [902, 905, 908, 910, 915],
  'US 10Y': [3.95, 3.9, 3.88, 3.85],
};

describe('buildCommentaryPrompt', () => {
  const prompt = buildCommentaryPrompt(sections, history);

  it('includes every section heading, label, value, delta and signal chip', () => {
    expect(prompt).toContain('## On-chain');
    expect(prompt).toContain('## Macro');
    expect(prompt).toContain('Hash Rate: 915.00 EH/s');
    expect(prompt).toContain('▲ +7.00 (+0.77%) on prior');
    expect(prompt).toContain('[neutral]');
    expect(prompt).toContain('US 10Y: 3.85 %');
  });

  it('renders the recent series oldest→latest for metrics that have history', () => {
    expect(prompt).toContain('recent (oldest→latest): 902 → 905 → 908 → 910 → 915');
    expect(prompt).toContain('recent (oldest→latest): 3.95 → 3.9 → 3.88 → 3.85');
  });

  it('omits the recent line for metrics with no (or single-point) history', () => {
    // Hash Ribbons has no history entry — its line should carry no series.
    const hashRibbonsBlock = prompt.split('Hash Ribbons')[1] ?? '';
    expect(hashRibbonsBlock.split('recent (oldest→latest)')[0]).toContain('Hash Rate');
  });

  it('instructs a ≤50-word, one-or-two-aspect analysis of changing conditions', () => {
    expect(prompt).toContain('changing conditions');
    expect(prompt).toContain('one or two');
    expect(prompt).toMatch(/50 words/);
  });
});
