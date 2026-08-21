import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { createFakeRepositories, type FakeRepositories } from '@/test/mocks/repositories';

// Converted to the seam in vertical 4.4. The newest-first / 30-row assertions
// moved to the adapter, where the query now lives.
let repositories: FakeRepositories;
vi.mock('@/lib/repositories', () => ({
  getRepositories: vi.fn(async () => repositories),
}));

import MarketReportsPage from './page';

beforeEach(() => {
  repositories = createFakeRepositories();
});

describe('MarketReportsPage', () => {
  it('renders the header and one row per report with status/mode chips', async () => {
    repositories = createFakeRepositories({
      marketReports: [
        {
          id: 'mr-1',
          asOf: '2026-07-18',
          status: 'published',
          narrationMarkdown: 'Hash rate fell 8% overnight.',
          emailed: true,
          isQuietDay: false,
        },
        {
          id: 'mr-2',
          asOf: '2026-07-17',
          status: 'held',
          narrationMarkdown: 'On-chain was quiet.',
          emailed: true,
          isQuietDay: true,
        },
      ],
    });

    render(await MarketReportsPage());

    expect(screen.getByRole('heading', { name: 'Market reports' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /18 July 2026/ })).toHaveAttribute(
      'href',
      '/market-reports/mr-1',
    );
    expect(screen.getByText('Published')).toBeInTheDocument();
    expect(screen.getByText('Held')).toBeInTheDocument();
    expect(screen.getByText('Quiet day')).toBeInTheDocument();
    expect(screen.getByText('Hash rate fell 8% overnight.')).toBeInTheDocument();
  });

  it('marks only the quiet day, not every report', async () => {
    // The quiet-day path is one of the two principles this surface carries, so
    // the chip appearing on a normal day would misrepresent the engine.
    repositories = createFakeRepositories({
      marketReports: [
        {
          id: 'mr-1',
          asOf: '2026-07-18',
          status: 'published',
          narrationMarkdown: 'Something moved.',
          emailed: true,
          isQuietDay: false,
        },
      ],
    });

    render(await MarketReportsPage());

    expect(screen.queryByText('Quiet day')).not.toBeInTheDocument();
  });

  it('shows the empty state when no reports exist', async () => {
    render(await MarketReportsPage());
    expect(screen.getByText(/No reports yet/)).toBeInTheDocument();
  });
});
