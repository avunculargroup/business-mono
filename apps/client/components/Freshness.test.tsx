import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Freshness } from './Freshness';

const NOW = new Date('2026-09-11T00:00:00Z');

describe('Freshness', () => {
  it('states the age in words rather than leaving a reader to subtract', () => {
    render(<Freshness asAt="2026-09-10" now={NOW} />);
    expect(screen.getByText(/Yesterday/)).toBeInTheDocument();
  });

  it('names the expected cadence once a figure is past it', () => {
    // "Last attested 401 days ago, expected cadence quarterly" is the signal.
    // The age alone is not, because the reader has to know what normal is.
    render(<Freshness asAt="2025-08-06" expectedCadenceDays={92} now={NOW} />);
    expect(screen.getByText(/expected every 92 days/)).toBeInTheDocument();
  });

  it('says so when a figure carries no date at all', () => {
    render(<Freshness asAt="" now={NOW} />);
    expect(screen.getByText('No date stated')).toBeInTheDocument();
  });

  it('does not claim staleness when no cadence is known', () => {
    render(<Freshness asAt="2020-01-01" now={NOW} />);
    expect(screen.queryByText(/expected every/)).not.toBeInTheDocument();
  });
});
