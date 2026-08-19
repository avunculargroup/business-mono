import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MacroIndicators } from './MacroIndicators';
import type { IndicatorLatest, IndicatorSeriesPoint } from '@/lib/indicators/format';

function latest(overrides: Partial<IndicatorLatest> = {}): IndicatorLatest {
  return {
    indicatorId: 'i1',
    name: 'US M2 Money Supply',
    shortLabel: 'US M2',
    region: 'us',
    category: 'money_supply',
    unit: 'usd_billion',
    decimals: 1,
    periodDate: '2026-05-01',
    currentValue: 21399,
    releasedAt: '2026-05-27',
    isRevision: false,
    supersededValue: null,
    priorValue: 21330,
    changeSincePrior: 69,
    pct_changeSincePrior: 0.32,
    yearAgoValue: 21000,
    yearAgoPeriod: '2025-05-01',
    yoyChange: 399,
    yoyPctChange: 1.9,
    daysSinceRelease: 3,
    typicalReleaseGapDays: 31,
    expectedNextRelease: '2026-06-27',
    ...overrides,
  } as IndicatorLatest;
}

function seriesFor(id: string, values: number[]): IndicatorSeriesPoint[] {
  return values.map((value, i) => ({
    indicatorId: id,
    shortLabel: id,
    periodDate: `2026-0${i + 1}-01`,
    value,
    releasedAt: null,
  })) as IndicatorSeriesPoint[];
}

describe('MacroIndicators', () => {
  it('groups au into Local and the rest into Global, and renders values', () => {
    const rows = [
      latest({ indicatorId: 'au1', shortLabel: 'RBA Cash Rate', region: 'au', category: 'policy_rate', unit: 'percent', decimals: 2, currentValue: 3.85 }),
      latest({ indicatorId: 'us1', shortLabel: 'US M2', region: 'us', currentValue: 21399 }),
    ];
    render(<MacroIndicators latest={rows} series={seriesFor('us1', [21290, 21330, 21399])} />);

    const local = screen.getByText('Local').closest('div')!.parentElement!;
    const global = screen.getByText('Global').closest('div')!.parentElement!;
    expect(within(local).getByText('RBA Cash Rate')).toBeInTheDocument();
    expect(within(global).getByText('US M2')).toBeInTheDocument();
    expect(screen.getByText('21,399.0')).toBeInTheDocument();
    expect(screen.getByText('3.85')).toBeInTheDocument();
  });

  it('shows the freshness marker for a recent print and the revised-from chip for a revision', () => {
    render(
      <MacroIndicators
        latest={[latest({ daysSinceRelease: 2, isRevision: true, supersededValue: 21360 })]}
        series={[]}
      />,
    );
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getByText('revised from 21,360.0')).toBeInTheDocument();
  });

  it('renders the awaiting-first-print state when there is no current value', () => {
    render(<MacroIndicators latest={[latest({ currentValue: null })]} series={[]} />);
    expect(screen.getByText('Awaiting first print')).toBeInTheDocument();
  });

  it('renders nothing when there are no indicators', () => {
    const { container } = render(<MacroIndicators latest={[]} series={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
