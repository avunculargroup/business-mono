import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TrendValuation } from './TrendValuation';
import type { OnchainDashboardRow } from '@/lib/onchain/format';

function row(overrides: Partial<OnchainDashboardRow> = {}): OnchainDashboardRow {
  return {
    key: 'ma_200d',
    name: 'Two-Hundred-Day Moving Average',
    short_label: '200-Day MA',
    metric_group: 'trend_valuation',
    unit: 'usd',
    decimals: 0,
    value: 92000,
    observed_at: '2026-07-03',
    change_since_prior: 300,
    pct_change_since_prior: 0.33,
    days_since_observed: 1,
    signal: null,
    ...overrides,
  } as OnchainDashboardRow;
}

describe('TrendValuation', () => {
  it('renders only trend_valuation rows, in the fixed metric order', () => {
    render(
      <TrendValuation
        latest={[
          // Out of order + a non-trend row that must be ignored.
          row({ key: 'mayer_multiple', short_label: 'Mayer Multiple', unit: 'ratio', decimals: 2, value: 1.15 }),
          row({ key: 'ma_50d', short_label: '50-Day MA', value: 95000 }),
          row({ key: 'ma_200d', short_label: '200-Day MA', value: 92000 }),
          row({ key: 'hash_rate', short_label: 'Hash Rate', metric_group: 'network_security', unit: 'eh_s', value: 642 }),
        ]}
      />,
    );

    const panel = screen.getByRole('region', { name: /trend & valuation/i });
    const labels = within(panel)
      .getAllByText(/50-Day MA|200-Day MA|Mayer Multiple/)
      .map((el) => el.textContent);
    expect(labels).toEqual(['50-Day MA', '200-Day MA', 'Mayer Multiple']);
    // The network-security row is not part of this panel.
    expect(within(panel).queryByText('Hash Rate')).not.toBeInTheDocument();
  });

  it('renders the 50d/200d cross as a neutral phrase, never a buy/sell call', () => {
    render(
      <TrendValuation
        latest={[
          row({ key: 'ma_cross', short_label: '50d vs 200d', unit: 'signal', decimals: 2, value: 4.2, signal: 'cross_up' }),
        ]}
      />,
    );
    // The chip states the relationship neutrally — no bare directional verb.
    expect(screen.getByText('50d crossed above 200d')).toBeInTheDocument();
    expect(screen.getByText(/50\/200-day spread \+4\.20%/)).toBeInTheDocument();
  });

  it('renders nothing when there are no trend rows', () => {
    const { container } = render(
      <TrendValuation latest={[row({ key: 'hash_rate', metric_group: 'network_security' })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
