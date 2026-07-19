import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Imported after the mocks above are registered (vi.mock is hoisted).
import MarketReportsPage from './page';

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('MarketReportsPage', () => {
  it('renders the header and one row per report with status/mode chips', async () => {
    fake.__setResponse('market_reports', {
      data: [
        {
          id: 'mr-1',
          as_of: '2026-07-18',
          status: 'published',
          report_mode: 'normal',
          narration_markdown: 'Hash rate fell 8% overnight.',
          emailed: true,
        },
        {
          id: 'mr-2',
          as_of: '2026-07-17',
          status: 'held',
          report_mode: 'quiet',
          narration_markdown: 'On-chain was quiet.',
          emailed: true,
        },
      ],
      error: null,
    });

    render(await MarketReportsPage());

    expect(screen.getByRole('heading', { name: 'Market reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /18 July 2026/ })).toHaveAttribute('href', '/market-reports/mr-1');
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getByText('Quiet day')).toBeInTheDocument();
    expect(screen.getByText('Hash rate fell 8% overnight.')).toBeInTheDocument();
  });

  it('queries market_reports newest-first with a 30-row cap', async () => {
    render(await MarketReportsPage());

    expect(fake.from).toHaveBeenCalledWith('market_reports');
    const [builder] = fake.__buildersFor('market_reports');
    expect(builder.order).toHaveBeenCalledWith('as_of', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(30);
  });

  it('shows the empty state when no reports exist', async () => {
    render(await MarketReportsPage());
    expect(screen.getByText(/No reports yet/)).toBeInTheDocument();
  });
});
