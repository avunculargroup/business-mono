import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { OnchainIndicators } from './OnchainIndicators';
import type { OnchainDashboardRow, OnchainSeriesPoint } from '@/lib/onchain/format';

function row(overrides: Partial<OnchainDashboardRow> = {}): OnchainDashboardRow {
  return {
    key: 'hash_rate',
    name: 'Network Hash Rate (7d)',
    short_label: 'Hash Rate',
    metric_group: 'network_security',
    unit: 'eh_s',
    decimals: 1,
    value: 642,
    observed_at: '2026-06-20',
    change_since_prior: 1.5,
    pct_change_since_prior: 0.23,
    days_since_observed: 1,
    signal: null,
    ...overrides,
  } as OnchainDashboardRow;
}

function seriesFor(key: string, values: number[]): OnchainSeriesPoint[] {
  return values.map((value, i) => ({
    indicator_id: key,
    key,
    short_label: key,
    observed_at: `2026-06-${10 + i}`,
    value,
  })) as OnchainSeriesPoint[];
}

describe('OnchainIndicators', () => {
  it('groups metrics by metric_group and renders values + EH/s unit', () => {
    const rows = [
      row({ key: 'hash_rate', short_label: 'Hash Rate', metric_group: 'network_security', value: 642 }),
      row({
        key: 'active_addresses',
        short_label: 'Active Addrs',
        metric_group: 'behaviour_valuation',
        unit: 'count',
        decimals: 0,
        value: 920000,
      }),
    ];
    render(<OnchainIndicators latest={rows} series={seriesFor('hash_rate', [640, 641, 642])} />);

    const security = screen.getByText('Network security').closest('div')!.parentElement!;
    const behaviour = screen.getByText('Holder behaviour & valuation').closest('div')!.parentElement!;
    expect(within(security).getByText('Hash Rate')).toBeInTheDocument();
    expect(within(behaviour).getByText('Active Addrs')).toBeInTheDocument();
    expect(screen.getByText('642.0')).toBeInTheDocument();
    expect(screen.getByText('EH/s')).toBeInTheDocument();
  });

  it('renders the Hash-Ribbons state as a neutral word, never a buy/sell call', () => {
    render(
      <OnchainIndicators
        latest={[row({ key: 'hash_ribbons', short_label: 'Hash Ribbons', unit: 'signal', value: 0.5, signal: 'recovery' })]}
        series={[]}
      />,
    );
    // The chip states the neutral cross state, never an action word.
    expect(screen.getByText('recovery')).toBeInTheDocument();
    expect(screen.queryByText('BUY')).not.toBeInTheDocument();
    expect(screen.queryByText('SELL')).not.toBeInTheDocument();
  });

  it('shows the MVRV historical-range marker (context, not a colour judgement)', () => {
    render(
      <OnchainIndicators
        latest={[row({ key: 'mvrv', short_label: 'MVRV', metric_group: 'behaviour_valuation', unit: 'ratio', decimals: 2, value: 2.1 })]}
        series={seriesFor('mvrv', [1.0, 3.5, 2.1])}
      />,
    );
    expect(screen.getByText('observed range')).toBeInTheDocument();
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('3.50')).toBeInTheDocument();
  });

  it('flags top-pool concentration above the threshold', () => {
    render(
      <OnchainIndicators
        latest={[row({ key: 'pool_concentration_top', short_label: 'Top Pool', unit: 'percent', value: 41 })]}
        series={[]}
      />,
    );
    expect(screen.getByText(/top pool above 35%/i)).toBeInTheDocument();
  });

  it('shows the freshness marker and an as-at date, and the awaiting state when empty', () => {
    render(
      <OnchainIndicators
        latest={[
          row({ days_since_observed: 1 }),
          row({
            key: 'mvrv',
            short_label: 'MVRV',
            metric_group: 'behaviour_valuation',
            value: null,
            observed_at: null,
            days_since_observed: null,
          }),
        ]}
        series={[]}
      />,
    );
    expect(screen.getByText('fresh')).toBeInTheDocument();
    expect(screen.getByText('as at 20 June 2026')).toBeInTheDocument();
    expect(screen.getByText('Awaiting first reading')).toBeInTheDocument();
  });

  it('renders nothing when there are no indicators', () => {
    const { container } = render(<OnchainIndicators latest={[]} series={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
