import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

let supabase: FakeSupabaseClient;
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => supabase),
}));

// Stub the interactive child: this test is about which rows land in which
// bucket, not about the form's transitions.
// Stubbed for the same reason as ReviewQueue: this test is about which rows
// reach which section and in what state, not about the form's transitions.
vi.mock('./CompanyProfileForm', () => ({
  CompanyProfileForm: ({
    initial,
    usedBy,
  }: {
    initial: Record<string, string | null> | null;
    usedBy: string[];
  }) => (
    <div
      data-testid="profile-form"
      data-has-profile={initial === null ? 'no' : 'yes'}
      data-used-by={[...usedBy].sort().join(',')}
    />
  ),
}));

vi.mock('./DocumentList', () => ({
  DocumentList: ({
    documents,
  }: {
    documents: Array<{ version: string; ready: boolean; missing: string[]; body: string }>;
  }) => (
    <div
      data-testid="documents"
      data-versions={documents.map((d) => d.version).join(',')}
      data-ready={documents.map((d) => String(d.ready)).join(',')}
      data-missing={documents.map((d) => d.missing.join('|')).join(';')}
      data-body={documents.map((d) => d.body).join(';')}
    />
  ),
}));

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

const PROFILE_FIELDS = [
  'legal_name', 'trading_name', 'abn', 'acn', 'registered_address',
  'registered_state', 'registered_postcode', 'public_phone', 'public_email',
  'public_website', 'complaints_contact', 'complaints_email', 'complaints_phone',
];
const FILLED_PROFILE = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, 'value']));

function statement(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    doc_type: 'service_statement',
    title: 'Service Statement',
    version: '0.1',
    body: 'ABN {{bts_abn}} for {{bts_legal_name}}.',
    status: 'draft',
    effective_from: null,
    ...overrides,
  };
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('prepare_templates', { data: [], error: null });
  supabase.__setResponse('client_library_entries', { data: [], error: null });
  supabase.__setResponse('compliance_documents', { data: [], error: null });
  supabase.__setResponse('company_profile', { data: null, error: null });
  process.env['NEXT_PUBLIC_PRIVACY_POLICY_URL'] = 'https://example.test/privacy';
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

describe('the compliance documents section', () => {
  it('resolves a document against the profile and reports it ready', async () => {
    supabase.__setResponse('compliance_documents', { data: [statement()], error: null });
    supabase.__setResponse('company_profile', { data: FILLED_PROFILE, error: null });

    render(await CompliancePage());

    const documents = screen.getByTestId('documents');
    expect(documents).toHaveAttribute('data-ready', 'true');
    expect(documents).toHaveAttribute('data-body', 'ABN value for value.');
  });

  it('names what blocks a document rather than only marking it unready', async () => {
    supabase.__setResponse('compliance_documents', { data: [statement()], error: null });
    supabase.__setResponse('company_profile', {
      data: { ...FILLED_PROFILE, abn: null },
      error: null,
    });

    render(await CompliancePage());

    const documents = screen.getByTestId('documents');
    expect(documents).toHaveAttribute('data-ready', 'false');
    expect(documents).toHaveAttribute('data-missing', 'bts_abn');
  });

  it('hands over no body at all for a document that cannot resolve', async () => {
    // A half-substituted preview would look publishable and is not.
    supabase.__setResponse('compliance_documents', { data: [statement()], error: null });

    render(await CompliancePage());

    expect(screen.getByTestId('documents')).toHaveAttribute('data-body', '');
  });

  it('orders documents by type then version, so the list does not shuffle', async () => {
    supabase.__setResponse('compliance_documents', {
      data: [
        statement({ id: 'b', version: '0.2' }),
        statement({ id: 'a', version: '0.1' }),
      ],
      error: null,
    });
    supabase.__setResponse('company_profile', { data: FILLED_PROFILE, error: null });

    render(await CompliancePage());

    expect(screen.getByTestId('documents')).toHaveAttribute('data-versions', '0.1,0.2');
  });

  it('tells the profile form only the fields the statement actually uses', async () => {
    // Reporting the terms of service blocked on a complaints phone number no
    // document mentions would be a lie.
    supabase.__setResponse('compliance_documents', { data: [statement()], error: null });

    render(await CompliancePage());

    expect(screen.getByTestId('profile-form')).toHaveAttribute(
      'data-used-by',
      'abn,legal_name',
    );
  });

  it('passes the profile through when there is one, and null when there is not', async () => {
    render(await CompliancePage());
    expect(screen.getByTestId('profile-form')).toHaveAttribute('data-has-profile', 'no');
  });

  it('reports a failed document read alongside the others', async () => {
    supabase.__setResponse('compliance_documents', {
      data: null,
      error: { message: 'relation "compliance_documents" does not exist' },
    });

    render(await CompliancePage());

    expect(screen.getByRole('status')).toHaveTextContent(/Could not read the review tables/);
  });
});
