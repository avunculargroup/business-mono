import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const orFilter = vi.fn();
let runRow: Record<string, unknown> | null = null;

// One builder serves both reads: newsletter_runs (via .or) and
// workflow_progress (via .eq). Every method chains; maybeSingle resolves.
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'order', 'limit']) b[m] = () => b;
  b.or = (filter: string) => {
    orFilter(filter);
    return b;
  };
  b.maybeSingle = async () => ({ data: table === 'newsletter_runs' ? runRow : null, error: null });
  return b;
}

vi.mock('@/lib/supabase/browser', () => ({
  createClient: () => ({ from: (table: string) => builder(table) }),
}));
vi.mock('@/hooks/useRealtimeSubscription', () => ({ useRealtimeSubscription: () => {} }));
vi.mock('@/app/actions/newsletter', () => ({ submitNewsletterGateDecision: vi.fn() }));
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}));
vi.mock('@/components/company/MarkdownRecordDisplay', () => ({
  MarkdownRecordDisplay: ({ content }: { content: string }) => <div>{content}</div>,
}));

const { NewsletterRunStatus } = await import('./NewsletterRunStatus');

describe('NewsletterRunStatus', () => {
  beforeEach(() => {
    orFilter.mockClear();
    runRow = null;
  });

  it('only asks for waiting runs started in the last two weeks', async () => {
    render(<NewsletterRunStatus />);
    await vi.waitFor(() => expect(orFilter).toHaveBeenCalled());

    const filter = orFilter.mock.calls[0][0] as string;
    const active = filter.match(/^and\(status\.in\.\(([^)]*)\),started_at\.gt\.([^)]+)\)/);
    expect(active?.[1]).toContain('suspended_gate2');
    const cutoff = Date.parse(active![2]);
    const fourteenDaysAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff - fourteenDaysAgo)).toBeLessThan(60_000);
  });

  it('keeps the full draft collapsed so the panel stays short', async () => {
    runRow = {
      workflow_run_id: 'run-1',
      status: 'suspended_gate2',
      time_range: 'month',
      started_at: new Date().toISOString(),
      gate_message: 'Draft ready',
      gate_draft_markdown: '# A long draft',
      notes: null,
    };
    render(<NewsletterRunStatus />);

    const summary = await screen.findByText('Full draft');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', { name: 'Publish to pipeline' })).toBeInTheDocument();
  });
});
