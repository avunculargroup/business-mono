import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let supabase: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}));

// Stub the interactive child: this test is about which rows land in which
// bucket, not about the form's transitions.
vi.mock('./ReviewQueue', () => ({
  ReviewQueue: ({
    awaiting,
    live,
  }: {
    awaiting: Array<{ slug: string; kind: string }>;
    live: Array<{ slug: string }>;
  }) => (
    <div
      data-testid="queue"
      data-awaiting={awaiting.map((i) => `${i.kind}:${i.slug}`).join(',')}
      data-live={live.map((i) => i.slug).join(',')}
    />
  ),
}));

import CompliancePage from './page';

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    slug: 'trustee-minute',
    title: 'Trustee minute',
    status: 'draft',
    version: '1.0',
    artefact_type: 'trustee_minute',
    client_type: 'smsf',
    lex_reviewed_at: null,
    review_due_date: null,
    ...overrides,
  };
}

function libraryEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'l1',
    slug: 'custody-basics',
    title: 'Custody basics',
    status: 'draft',
    lex_reviewed_at: null,
    review_due_date: null,
    ...overrides,
  };
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('prepare_templates', { data: [], error: null });
  supabase.__setResponse('client_library_entries', { data: [], error: null });
});

describe('CompliancePage', () => {
  it('renders the header', async () => {
    render(await CompliancePage());

    expect(screen.getByRole('heading', { name: 'Compliance review' })).toBeInTheDocument();
  });

  it('puts drafts from both tables in the awaiting bucket', async () => {
    supabase.__setResponse('prepare_templates', { data: [template()], error: null });
    supabase.__setResponse('client_library_entries', { data: [libraryEntry()], error: null });

    render(await CompliancePage());

    // Both are unscheduled, so they order by slug rather than by table — the
    // queue is one list, not two stacked ones.
    expect(screen.getByTestId('queue')).toHaveAttribute(
      'data-awaiting',
      'library:custody-basics,template:trustee-minute',
    );
  });

  it('reads active as live for a template and published as live for a library entry', async () => {
    // The two tables spell the same state differently. Getting this wrong would
    // silently leave published library entries in the review queue for ever.
    supabase.__setResponse('prepare_templates', {
      data: [template({ status: 'active', review_due_date: '2027-01-01' })],
      error: null,
    });
    supabase.__setResponse('client_library_entries', {
      data: [libraryEntry({ status: 'published', review_due_date: '2027-02-01' })],
      error: null,
    });

    render(await CompliancePage());

    const queue = screen.getByTestId('queue');
    expect(queue).toHaveAttribute('data-awaiting', '');
    expect(queue).toHaveAttribute('data-live', 'trustee-minute,custody-basics');
  });

  it('leaves a superseded template out of both buckets', async () => {
    supabase.__setResponse('prepare_templates', {
      data: [template({ status: 'superseded' })],
      error: null,
    });

    render(await CompliancePage());

    const queue = screen.getByTestId('queue');
    expect(queue).toHaveAttribute('data-awaiting', '');
    expect(queue).toHaveAttribute('data-live', '');
  });

  it('says so when the tables cannot be read, rather than showing an empty queue', async () => {
    // The migrations are unapplied, so this is today's state. An empty queue
    // that means "nothing to review" and an empty queue that means "the read
    // failed" look identical, and on this page the difference matters.
    supabase.__setResponse('prepare_templates', {
      data: null,
      error: { message: 'relation "prepare_templates" does not exist' },
    });

    render(await CompliancePage());

    expect(screen.getByRole('status')).toHaveTextContent(
      /Could not read the review tables/,
    );
  });

  it('says nothing about a read error when both reads succeed', async () => {
    render(await CompliancePage());

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
