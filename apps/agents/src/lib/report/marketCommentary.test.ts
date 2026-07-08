import { describe, it, expect } from 'vitest';
import { buildCommentaryPrompt, pivotTrendRows, type HistoryMap } from './marketCommentary.js';
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

describe('pivotTrendRows', () => {
  it('pivots v_btc_trend columns into the report section labels, oldest→latest', () => {
    const rows = [
      { observed_at: '2026-07-01', ma_200d: 90000, mayer_multiple: 1.10, rsi_14: 48, ma_cross_spread_pct: 2.0, drawdown_pct: -20, ma_50d: null, ma_200w: null, realized_vol_30d: null },
      { observed_at: '2026-07-02', ma_200d: 91000, mayer_multiple: 1.12, rsi_14: 52, ma_cross_spread_pct: 3.0, drawdown_pct: -18, ma_50d: null, ma_200w: null, realized_vol_30d: null },
      { observed_at: '2026-07-03', ma_200d: 92000, mayer_multiple: 1.15, rsi_14: 55, ma_cross_spread_pct: 4.2, drawdown_pct: -17, ma_50d: null, ma_200w: null, realized_vol_30d: null },
    ];
    const map = pivotTrendRows(rows, 7);
    expect(map['200-Day MA']).toEqual([90000, 91000, 92000]);
    expect(map['Mayer Multiple']).toEqual([1.10, 1.12, 1.15]);
    expect(map['RSI (14d)']).toEqual([48, 52, 55]);
    expect(map['50d vs 200d']).toEqual([2.0, 3.0, 4.2]);
    expect(map['Drawdown']).toEqual([-20, -18, -17]);
    // Columns that were null across every row produce no label at all.
    expect(map['50-Day MA']).toBeUndefined();
    expect(map['Volatility (30d)']).toBeUndefined();
  });

  it('keeps only the last `keep` points per metric', () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      observed_at: `2026-07-${String(i + 1).padStart(2, '0')}`,
      ma_200d: 90000 + i,
    })) as Parameters<typeof pivotTrendRows>[0];
    expect(pivotTrendRows(rows, 7)['200-Day MA']).toHaveLength(7);
    expect(pivotTrendRows(rows, 7)['200-Day MA'].at(-1)).toBe(90009);
  });
});
