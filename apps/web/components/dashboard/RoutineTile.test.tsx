import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoutineTile } from './RoutineTile';

function routine(sources: Array<{ url: string; title: string; source?: string; paywalled?: boolean }>) {
  return {
    id: 'r1',
    name: 'Daily news curation',
    dashboard_title: 'Daily News',
    last_run_at: null,
    timezone: 'Australia/Melbourne',
    last_result: { sources, metadata: { mood_summary: 'Quiet day.', more_news_url: '/news' } },
  };
}

describe('RoutineTile', () => {
  it('marks only paywalled stories with a "Paywall" badge', () => {
    render(
      <RoutineTile
        routine={routine([
          { url: 'https://a.example/1', title: 'Locked story', source: 'AFR', paywalled: true },
          { url: 'https://b.example/2', title: 'Open story', source: 'Reuters' },
        ])}
      />,
    );

    expect(screen.getAllByText('Paywall')).toHaveLength(1);
    const locked = screen.getByRole('link', { name: 'Locked story' }).closest('li');
    expect(locked).toHaveTextContent('Paywall');
    const open = screen.getByRole('link', { name: 'Open story' }).closest('li');
    expect(open).not.toHaveTextContent('Paywall');
  });

  it('links its footer where the routine says, labelled as it says', () => {
    render(
      <RoutineTile
        routine={{
          id: 'r2',
          name: 'Weekly corporate research ingest',
          dashboard_title: 'Corporate research review',
          last_run_at: null,
          timezone: 'Australia/Melbourne',
          last_result: {
            summary: '4 rows waiting for review on 2 records: Strategy Inc, Metaplanet Inc.',
            sources: [],
            metadata: { link_url: '/research?view=review', link_label: 'Review queue' },
          },
        }}
      />,
    );

    expect(screen.getByText(/4 rows waiting for review/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review queue →' })).toHaveAttribute(
      'href',
      '/research?view=review',
    );
    expect(screen.queryByRole('link', { name: /View routine/ })).not.toBeInTheDocument();
  });
});
