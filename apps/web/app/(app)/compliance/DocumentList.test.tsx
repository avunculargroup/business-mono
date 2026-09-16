import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentList, type DocumentRow } from './DocumentList';

// The card's buttons all call server actions. This test is about what a blocked
// document says it is blocked on, so the actions are stubbed rather than driven.
vi.mock('@/app/actions/complianceDocuments', () => ({
  activateComplianceDocument: vi.fn(),
}));
vi.mock('@/app/actions/complianceEditing', () => ({
  createComplianceDocumentVersion: vi.fn(),
  updateComplianceDocumentBody: vi.fn(),
}));
vi.mock('./BodyEditor', () => ({ BodyEditor: () => <div /> }));

function doc(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    docType: 'service_statement',
    title: 'Service Statement',
    version: '0.1',
    status: 'draft',
    effectiveFrom: null,
    ready: false,
    missing: ['bts_abn'],
    body: '',
    rawBody: 'ABN {{bts_abn}}.',
    ...overrides,
  };
}

describe('DocumentList', () => {
  it('names the missing placeholders on a blocked document', () => {
    render(<DocumentList documents={[doc({ missing: ['bts_abn', 'complaints_email'] })]} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Cannot go live: bts_abn, complaints_email have no value',
    );
  });

  it('says where the privacy policy URL comes from when it is the blocker', () => {
    // The whole point of the extra line: the value is an environment variable
    // of this app, is usually already set on Minute's separate Vercel project,
    // and is baked in at build time — so "it is set in prod" and "this page
    // says it is not" are both true, and nothing else on the page says why.
    render(<DocumentList documents={[doc({ missing: ['bts_privacy_policy_url'] })]} />);

    expect(screen.getByText(/NEXT_PUBLIC_PRIVACY_POLICY_URL/)).toBeInTheDocument();
    expect(
      screen.getByText(/not a field on the profile form below/),
    ).toBeInTheDocument();
    expect(screen.getByText(/redeploy this app/)).toBeInTheDocument();
  });

  it('leaves the privacy policy note out when something else is missing', () => {
    render(<DocumentList documents={[doc({ missing: ['bts_abn'] })]} />);

    expect(screen.queryByText(/NEXT_PUBLIC_PRIVACY_POLICY_URL/)).not.toBeInTheDocument();
  });

  it('leaves it out on a document that resolves', () => {
    render(<DocumentList documents={[doc({ ready: true, missing: [], body: 'ABN 123.' })]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByText(/NEXT_PUBLIC_PRIVACY_POLICY_URL/)).not.toBeInTheDocument();
  });
});
