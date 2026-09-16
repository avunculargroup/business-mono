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

  it('names the privacy policy URL like any other blocker', () => {
    // It used to carry an extra line saying it came from
    // NEXT_PUBLIC_PRIVACY_POLICY_URL rather than from the profile form. It is a
    // column as of 20260916010000, so the plain list is now the whole truth.
    render(<DocumentList documents={[doc({ missing: ['bts_privacy_policy_url'] })]} />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Cannot go live: bts_privacy_policy_url has no value',
    );
  });

  it('says nothing at all on a document that resolves', () => {
    render(<DocumentList documents={[doc({ ready: true, missing: [], body: 'ABN 123.' })]} />);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
