import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReportWatchHealthRow } from '@platform/shared';

const clearMock = vi.fn(async () => ({ success: true }));
vi.mock('@/app/actions/reportWatch', () => ({
  clearDetectionAlert: (...args: unknown[]) => clearMock(...(args as [])),
}));

const successToast = vi.fn();
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => ({ success: successToast, error: vi.fn() }),
}));

const { ReportWatchHealth } = await import('./ReportWatchHealth');

const row = (over: Partial<ReportWatchHealthRow> = {}): ReportWatchHealthRow => ({
  source_id: 's1',
  name: 'River Financial',
  is_active: true,
  detection_strategies: ['rss', 'index_page'],
  detection_last_success_at: '2026-06-03T00:00:00Z',
  detection_consecutive_empty: 0,
  days_since_candidate: 61,
  candidates_30d: 0,
  acquired_30d: 0,
  failed_total: 0,
  latest_report_published_at: null,
  ...over,
});

beforeEach(() => {
  clearMock.mockClear();
  successToast.mockClear();
});

describe('ReportWatchHealth', () => {
  it('renders nothing when there are no report_watch sources', () => {
    const { container } = render(<ReportWatchHealth rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('says everything is healthy when no source has stopped returning candidates', () => {
    render(<ReportWatchHealth rows={[row()]} />);
    expect(screen.getByText(/still returning candidates/i)).toBeInTheDocument();
  });

  it('names the count needing attention and frames it as a scraper problem', () => {
    render(<ReportWatchHealth rows={[row({ detection_consecutive_empty: 12 })]} />);

    // The whole point of the number is that a broken selector and a quiet
    // publisher look identical from outside.
    expect(screen.getByText(/1 source has stopped returning candidates/i)).toBeInTheDocument();
    expect(screen.getByText(/page structure changed, not that the publisher went quiet/i)).toBeInTheDocument();
  });

  it('shows the strategy order the scan will try', () => {
    render(<ReportWatchHealth rows={[row()]} />);
    expect(screen.getByText('feed → index page')).toBeInTheDocument();
  });

  it('offers Clear alert only above the warning threshold', () => {
    const { rerender } = render(<ReportWatchHealth rows={[row({ detection_consecutive_empty: 3 })]} />);
    expect(screen.queryByRole('button', { name: /clear alert/i })).not.toBeInTheDocument();

    rerender(<ReportWatchHealth rows={[row({ detection_consecutive_empty: 4 })]} />);
    expect(screen.getByRole('button', { name: /clear alert/i })).toBeInTheDocument();
  });

  it('clears the counter and drops the row out of the attention count', async () => {
    const user = userEvent.setup();
    render(<ReportWatchHealth rows={[row({ detection_consecutive_empty: 12 })]} />);

    await user.click(screen.getByRole('button', { name: /clear alert/i }));

    expect(clearMock).toHaveBeenCalledWith('s1');
    expect(successToast).toHaveBeenCalled();
    expect(screen.getByText(/still returning candidates/i)).toBeInTheDocument();
  });

  it('marks a paused source without hiding it', () => {
    render(<ReportWatchHealth rows={[row({ is_active: false })]} />);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /River Financial/ })).toBeInTheDocument();
  });

  it('shows Never when a source has never produced a candidate', () => {
    render(<ReportWatchHealth rows={[row({ detection_last_success_at: null })]} />);
    expect(screen.getByText('Never')).toBeInTheDocument();
  });
});
