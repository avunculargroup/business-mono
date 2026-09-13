import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';
import { PROFILE_FIELDS } from '@/lib/compliance/documents';

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

import { activateComplianceDocument, saveCompanyProfile } from './complianceDocuments';

const FILLED = Object.fromEntries(PROFILE_FIELDS.map((f) => [f, 'value']));

const STATEMENT = {
  id: 'doc-1',
  doc_type: 'service_statement',
  title: 'Service Statement',
  version: '0.1',
  body: 'ABN {{bts_abn}}, {{bts_legal_name}}. See {{bts_privacy_policy_url}}.',
  status: 'draft',
  effective_from: null,
};

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('compliance_documents', { data: STATEMENT, error: null });
  supabase.__setResponse('company_profile', { data: FILLED, error: null });
  authed = true;
  revalidatePath.mockClear();
  process.env['NEXT_PUBLIC_PRIVACY_POLICY_URL'] = 'https://example.test/privacy';
});

describe('saveCompanyProfile', () => {
  it('upserts the singleton row', async () => {
    const result = await saveCompanyProfile(FILLED);

    expect(result).toEqual({ success: true });
    const builder = supabase.__buildersFor('company_profile')[0];
    const [row, options] = builder!.upsert.mock.calls[0] as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(row.id).toBe(true);
    expect(options.onConflict).toBe('id');
  });

  it('writes null rather than an empty string for a field left blank', async () => {
    // "" and NULL resolve the same, but NULL is honest about a field never
    // having been filled.
    await saveCompanyProfile({ ...FILLED, acn: '   ' });

    const row = supabase.__buildersFor('company_profile')[0]!.upsert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.acn).toBeNull();
  });

  it('trims what it stores', async () => {
    await saveCompanyProfile({ ...FILLED, abn: '  11 222 333 444  ' });

    const row = supabase.__buildersFor('company_profile')[0]!.upsert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row.abn).toBe('11 222 333 444');
  });

  it('refuses to blank the two NOT NULL fields, as a sentence not a constraint error', async () => {
    const result = await saveCompanyProfile({ ...FILLED, legal_name: '', trading_name: '' });

    expect(result.error).toBe('legal_name and trading_name cannot be empty.');
    expect(supabase.__buildersFor('company_profile')).toHaveLength(0);
  });

  it('ignores a key that is not a profile field', async () => {
    await saveCompanyProfile({ ...FILLED, licence_number: 'AFSL 12345' });

    const row = supabase.__buildersFor('company_profile')[0]!.upsert.mock
      .calls[0]![0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('licence_number');
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;

    expect(await saveCompanyProfile(FILLED)).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});

describe('activateComplianceDocument', () => {
  it('publishes through the RPC, not through two updates', async () => {
    // Two client-side updates would leave zero active documents if the second
    // failed, which for a Service Statement locks every subscriber out.
    const result = await activateComplianceDocument('doc-1');

    expect(result).toEqual({ success: true });
    expect(supabase.rpc).toHaveBeenCalledWith('activate_compliance_document', {
      p_id: 'doc-1',
    });
  });

  it('refuses when a profile field the document uses is blank', async () => {
    supabase.__setResponse('company_profile', {
      data: { ...FILLED, abn: null },
      error: null,
    });

    const result = await activateComplianceDocument('doc-1');

    expect(result.error).toMatch(/bts_abn/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('refuses when the privacy URL is unset, which no profile form would show', async () => {
    delete process.env['NEXT_PUBLIC_PRIVACY_POLICY_URL'];

    const result = await activateComplianceDocument('doc-1');

    expect(result.error).toMatch(/bts_privacy_policy_url/);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('says what a subscriber would see, not just that it failed', async () => {
    supabase.__setResponse('company_profile', { data: null, error: null });

    const result = await activateComplianceDocument('doc-1');

    expect(result.error).toMatch(/not available/);
  });

  it('re-checks against the live profile rather than trusting the caller', async () => {
    // The button that got here can be stale: someone else may have blanked a
    // field since the page rendered.
    supabase.__setResponse('company_profile', { data: { ...FILLED, legal_name: '' }, error: null });

    const result = await activateComplianceDocument('doc-1');

    expect(result.error).toMatch(/bts_legal_name/);
  });

  it('declines a version that is already live', async () => {
    supabase.__setResponse('compliance_documents', {
      data: { ...STATEMENT, status: 'active' },
      error: null,
    });

    expect(await activateComplianceDocument('doc-1')).toEqual({
      error: 'That version is already live.',
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('declines a document that has gone', async () => {
    supabase.__setResponse('compliance_documents', { data: null, error: null });

    expect(await activateComplianceDocument('doc-1')).toEqual({
      error: 'That document no longer exists.',
    });
  });

  it('revalidates the queue on success', async () => {
    await activateComplianceDocument('doc-1');

    expect(revalidatePath).toHaveBeenCalledWith('/compliance');
  });

  it('does not revalidate when the RPC failed', async () => {
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });

    const result = await activateComplianceDocument('doc-1');

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;

    expect(await activateComplianceDocument('doc-1')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});
