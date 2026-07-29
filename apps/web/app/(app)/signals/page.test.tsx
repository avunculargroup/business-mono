import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let fake: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// Stub the interactive child so this stays a test of the query wiring and the
// prop hand-off, not of the feed's rendering.
vi.mock('@/components/ecosystem/SignalsView', () => ({
  SignalsView: ({ changes, watchHealth }: { changes: unknown[]; watchHealth: unknown[] }) => (
    <div data-testid="signals-view">
      <span data-testid="change-count">{changes.length}</span>
      <span data-testid="health-count">{watchHealth.length}</span>
    </div>
  ),
}));

const { SignalsContent } = await import('./SignalsContent');

beforeEach(() => {
  fake = createFakeSupabase();
});

describe('SignalsContent', () => {
  it('reads the feed and health views, never the base tables', async () => {
    fake.__setResponse('v_ecosystem_feed', {
      data: [{ id: 'ch1', title: 'firmware v6.3.4' }],
      error: null,
    });
    fake.__setResponse('v_ecosystem_watch_health', { data: [{ id: 'w1' }], error: null });

    render(await SignalsContent());

    expect(fake.from).toHaveBeenCalledWith('v_ecosystem_feed');
    expect(fake.from).toHaveBeenCalledWith('v_ecosystem_watch_health');
    // The view already excludes dismissed/archived and carries entity context;
    // reading the tables directly would bypass both.
    expect(fake.from).not.toHaveBeenCalledWith('ecosystem_changes');
    expect(fake.from).not.toHaveBeenCalledWith('ecosystem_watches');
    expect(screen.getByTestId('change-count')).toHaveTextContent('1');
    expect(screen.getByTestId('health-count')).toHaveTextContent('1');
  });

  it('bounds the feed query', async () => {
    fake.__setResponse('v_ecosystem_feed', { data: [], error: null });
    fake.__setResponse('v_ecosystem_watch_health', { data: [], error: null });

    render(await SignalsContent());

    expect(fake.__buildersFor('v_ecosystem_feed')[0].limit).toHaveBeenCalledWith(200);
  });

  it('renders with empty lists when the queries return null', async () => {
    fake.__setResponse('v_ecosystem_feed', { data: null, error: null });
    fake.__setResponse('v_ecosystem_watch_health', { data: null, error: null });

    render(await SignalsContent());

    expect(screen.getByTestId('change-count')).toHaveTextContent('0');
    expect(screen.getByTestId('health-count')).toHaveTextContent('0');
  });
});
