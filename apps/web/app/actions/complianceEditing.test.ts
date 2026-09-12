import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let supabase: FakeSupabaseClient;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () =>
    authed
      ? { ok: true, supabase, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  createComplianceDocumentVersion,
  createTemplateVersion,
  updateComplianceDocumentBody,
  updateTemplateBody,
} from './complianceEditing';

const VALID_TEMPLATE = `---
slug: board-paper-treasury
version: 1.0
artefact_type: board_paper
client_type: corporate
title: Board paper
facts_required:
  - btc_spot_aud
---

::section id=purpose
prompt: What decision is being sought?
why: A paper that does not name the decision invites the reader to infer one.
facts: [btc_spot_aud]
::
`;

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    doc_type: 'service_statement',
    title: 'Service Statement',
    version: '0.1',
    body: 'Original text.',
    status: 'draft',
    ...overrides,
  };
}

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tpl-1',
    slug: 'board-paper-treasury',
    title: 'Board paper',
    artefact_type: 'board_paper',
    client_type: 'corporate',
    version: '1.0',
    body: VALID_TEMPLATE,
    status: 'draft',
    facts_required: ['btc_spot_aud'],
    regulatory_references: ['AASB 138'],
    ...overrides,
  };
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('compliance_documents', { data: document(), error: null });
  supabase.__setResponse('prepare_templates', { data: template(), error: null });
  authed = true;
  revalidatePath.mockClear();
});

function patchFor(table: string, builderIndex = 1): Record<string, unknown> {
  const builder = supabase.__buildersFor(table)[builderIndex];
  return builder!.update.mock.calls[0]![0] as Record<string, unknown>;
}

describe('updateComplianceDocumentBody', () => {
  it('saves a draft body', async () => {
    const result = await updateComplianceDocumentBody('doc-1', 'New text.');

    expect(result).toEqual({ success: true });
    expect(patchFor('compliance_documents').body).toBe('New text.');
  });

  it('refuses a live body, with the remedy in the message', async () => {
    supabase.__setResponse('compliance_documents', {
      data: document({ status: 'active' }),
      error: null,
    });

    const result = await updateComplianceDocumentBody('doc-1', 'New text.');

    expect(result.error).toMatch(/new version/);
    expect(supabase.__buildersFor('compliance_documents')).toHaveLength(1);
  });

  it('refuses a retired body without offering a new version', async () => {
    supabase.__setResponse('compliance_documents', {
      data: document({ status: 'archived' }),
      error: null,
    });

    const result = await updateComplianceDocumentBody('doc-1', 'New text.');

    expect(result.error).toMatch(/evidence/);
  });

  it('refuses an empty body, which would resolve perfectly and say nothing', async () => {
    expect(await updateComplianceDocumentBody('doc-1', '   ')).toEqual({
      error: 'The body cannot be empty.',
    });
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;
    expect(await updateComplianceDocumentBody('doc-1', 'x')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});

describe('updateTemplateBody', () => {
  it('saves a body that parses and validates', async () => {
    const result = await updateTemplateBody('tpl-1', VALID_TEMPLATE);

    expect(result.success).toBe(true);
    expect(patchFor('prepare_templates').body).toBe(VALID_TEMPLATE);
  });

  it('writes facts_required from the same parse that validated the body', async () => {
    // Two parses would be two chances for the column and the body to disagree,
    // and the adapter reads the column.
    await updateTemplateBody('tpl-1', VALID_TEMPLATE);

    expect(patchFor('prepare_templates').facts_required).toEqual(['btc_spot_aud']);
  });

  it('refuses a body that would not render, and says which rules it broke', async () => {
    const broken = VALID_TEMPLATE.replace(
      'prompt: What decision is being sought?',
      'prompt: State the decision.',
    );

    const result = await updateTemplateBody('tpl-1', broken);

    expect(result.error).toBe('This template would not render.');
    expect(result.problems?.[0]?.message).toMatch(/must be a question/);
    expect(supabase.__buildersFor('prepare_templates')).toHaveLength(1);
  });

  it('refuses a prohibited conclusion', async () => {
    const broken = VALID_TEMPLATE.replace('why: A paper', 'why: We recommend it. A paper');

    const result = await updateTemplateBody('tpl-1', broken);

    expect(result.problems?.some((p) => p.message.includes('prohibited conclusion'))).toBe(true);
  });

  it('refuses a live template body', async () => {
    supabase.__setResponse('prepare_templates', {
      data: template({ status: 'active' }),
      error: null,
    });

    const result = await updateTemplateBody('tpl-1', VALID_TEMPLATE);

    expect(result.error).toMatch(/new version/);
  });

  it('warns that a Lex review was cleared when editing a reviewed template', async () => {
    // The trigger clears it. Saying so beats letting someone discover it when
    // the publish button stops working.
    supabase.__setResponse('prepare_templates', {
      data: template({ status: 'approved' }),
      error: null,
    });

    const result = await updateTemplateBody('tpl-1', VALID_TEMPLATE);

    expect(result).toEqual({ success: true, reviewCleared: true });
  });

  it('does not claim a review was cleared when editing a plain draft', async () => {
    const result = await updateTemplateBody('tpl-1', VALID_TEMPLATE);

    expect(result).toEqual({ success: true, reviewCleared: false });
  });
});

describe('createComplianceDocumentVersion', () => {
  it('copies the body into a new draft', async () => {
    const result = await createComplianceDocumentVersion('doc-1', '0.2');

    expect(result).toEqual({ success: true });
    const row = supabase.__buildersFor('compliance_documents')[1]!.insert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.version).toBe('0.2');
    expect(row.body).toBe('Original text.');
    expect(row.status).toBe('draft');
    expect(row.effective_from).toBeNull();
    expect(row.notes).toMatch(/Copied from version 0\.1/);
  });

  it('starts a copy of a live document as a draft, not as live', async () => {
    supabase.__setResponse('compliance_documents', {
      data: document({ status: 'active' }),
      error: null,
    });

    await createComplianceDocumentVersion('doc-1', '0.2');

    const row = supabase.__buildersFor('compliance_documents')[1]!.insert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.status).toBe('draft');
  });

  it('rejects a version label that is really a sentence', async () => {
    const result = await createComplianceDocumentVersion('doc-1', 'the one from June');

    expect(result.error).toMatch(/no spaces/);
    expect(supabase.__buildersFor('compliance_documents')).toHaveLength(0);
  });

  it('explains a duplicate version rather than surfacing the index', async () => {
    supabase.__setResponse('compliance_documents', {
      data: document(),
      error: { message: 'duplicate key', code: '23505' } as never,
    });

    const result = await createComplianceDocumentVersion('doc-1', '0.2');

    expect(result.error).toMatch(/already exists/);
  });
});

describe('createTemplateVersion', () => {
  it('rewrites the front-matter version so the column and the body agree', async () => {
    await createTemplateVersion('tpl-1', '1.1');

    const row = supabase.__buildersFor('prepare_templates')[1]!.insert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.version).toBe('1.1');
    expect(row.body).toContain('version: 1.1');
    expect(row.body).not.toContain('version: 1.0');
  });

  it('carries the columns the RLS policy reads', async () => {
    await createTemplateVersion('tpl-1', '1.1');

    const row = supabase.__buildersFor('prepare_templates')[1]!.insert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.client_type).toBe('corporate');
    expect(row.artefact_type).toBe('board_paper');
    expect(row.facts_required).toEqual(['btc_spot_aud']);
  });

  it('marks the copy as unreviewed in its notes', async () => {
    await createTemplateVersion('tpl-1', '1.1');

    const row = supabase.__buildersFor('prepare_templates')[1]!.insert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.status).toBe('draft');
    expect(row.notes).toMatch(/Not reviewed/);
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;
    expect(await createTemplateVersion('tpl-1', '1.1')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});
