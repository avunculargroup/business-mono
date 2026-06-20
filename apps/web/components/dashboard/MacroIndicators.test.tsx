import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MacroIndicators } from './MacroIndicators';
import type { IndicatorLatest, IndicatorSeriesPoint } from '@/lib/indicators/format';

function latest(overrides: Partial<IndicatorLatest> = {}): IndicatorLatest {
  return {
    indicator_id: 'i1',
    name: 'US M2 Money Supply',
    short_label: 'US M2',
    region: 'us',
    category: 'money_supply',
    unit: 'usd_billion',
    decimals: 1,
    period_date: '2026-05-01',
    current_value: 21399,
    released_at: '2026-05-27',
    is_revision: false,
    superseded_value: null,
    prior_value: 21330,
    change_since_prior: 69,
    pct_change_since_prior: 0.32,
    year_ago_value: 21000,
    year_ago_period: '2025-05-01',
    yoy_change: 399,
    yoy_pct_change: 1.9,
    days_since_release: 3,
    typical_release_gap_days: 31,
    expected_next_release: '2026-06-27',
    ...overrides,
  } as IndicatorLatest;
}

function seriesFor(id: string, values: number[]): IndicatorSeriesPoint[] {
  return values.map((value, i) => ({
    indicator_id: id,
    short_label: id,
    period_date: `2026-0${i + 1}-01`,
    value,
    released_at: null,
  })) as IndicatorSeriesPoint[];
}

describe('MacroIndicators', () => {
  it('groups au into Local and the rest into Global, and renders values', () => {
    const rows = [
      latest({ indicator_id: 'au1', short_label: 'RBA Cash Rate', region: 'au', category: 'policy_rate', unit: 'percent', decimals: 2, current_value: 3.85 }),
      latest({ indicator_id: 'us1', short_label: 'US M2', region: 'us', current_value: 21399 }),
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
        latest={[latest({ days_since_release: 2, is_revision: true, superseded_value: 21360 })]}
        series={[]}
      />,
    );
    expect(screen.getByText('new')).toBeInTheDocument();
    expect(screen.getByText('revised from 21,360.0')).toBeInTheDocument();
  });

  it('renders the awaiting-first-print state when there is no current value', () => {
    render(<MacroIndicators latest={[latest({ current_value: null })]} series={[]} />);
    expect(screen.getByText('Awaiting first print')).toBeInTheDocument();
  });

  it('renders nothing when there are no indicators', () => {
    const { container } = render(<MacroIndicators latest={[]} series={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
