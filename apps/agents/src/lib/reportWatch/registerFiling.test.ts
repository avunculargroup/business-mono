import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';

let fakeSupabase: FakeSupabaseClient;
vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));

const { classifyFiling, filingTitle, registerFiling } = await import('./registerFiling.js');

const EIGHT_K = {
  form: '8-K',
  accession: '0001193125-26-401111',
  items: ['7.01', '8.01'],
  reportDate: '2026-09-29',
  filerName: 'Strategy Inc',
};
const input = (filing: typeof EIGHT_K | null = EIGHT_K) => ({
  companyId: 'co-strategy',
  url: 'https://www.sec.gov/Archives/edgar/data/1050446/000119312526401111/mstr-20260929.htm',
  filing,
  publishedAt: '2026-09-29',
});

beforeEach(() => {
  fakeSupabase = createFakeSupabase();
});

describe('classifyFiling', () => {
  it('classes forms as the hand-entered SEC rows were classed', () => {
    expect(classifyFiling('8-K')).toEqual({
      documentType: 'announcement',
      sourceClass: 'exchange_announcement',
      isAudited: false,
    });
    expect(classifyFiling('6-K')?.sourceClass).toBe('exchange_announcement');
    expect(classifyFiling('10-Q')).toEqual({ documentType: 'other', sourceClass: 'filed_financials', isAudited: false });
    expect(classifyFiling('10-K')).toEqual({ documentType: 'annual_report', sourceClass: 'audited_accounts', isAudited: true });
  });

  it('has no class for a form the register does not read', () => {
    expect(classifyFiling('424B5')).toBeNull();
    expect(classifyFiling('4')).toBeNull();
  });
});

describe('filingTitle', () => {
  it('names the items, or the period', () => {
    expect(filingTitle(EIGHT_K)).toBe('Form 8-K — Items 7.01, 8.01');
    expect(filingTitle({ ...EIGHT_K, form: '10-Q', items: [], reportDate: '2026-09-30' })).toBe(
      'Form 10-Q, period ended 2026-09-30',
    );
  });
});

describe('registerFiling', () => {
  it('registers a new filing against the company, classed by its form', async () => {
    fakeSupabase.__setResponses('research_documents', [
      { data: null, error: null },
      { data: { id: 'doc-new' }, error: null },
    ]);

    const outcome = await registerFiling(input());

    expect(outcome).toEqual({ ok: true, documentId: 'doc-new', created: true });
    const [, insert] = fakeSupabase.__buildersFor('research_documents');
    expect(insert!.insert).toHaveBeenCalledWith({
      company_id: 'co-strategy',
      venue: 'sec',
      announcement_id: '0001193125-26-401111',
      pdf_url: input().url,
      title: 'Form 8-K — Items 7.01, 8.01',
      document_type: 'announcement',
      source_class: 'exchange_announcement',
      is_audited: false,
      published_at: '2026-09-29',
      filing_entity: 'Strategy Inc',
    });
  });

  it('leaves a filing someone registered by hand exactly as they wrote it', async () => {
    fakeSupabase.__setResponse('research_documents', { data: { id: 'doc-by-hand' }, error: null });

    const outcome = await registerFiling(input());

    expect(outcome).toEqual({ ok: true, documentId: 'doc-by-hand', created: false });
    const [lookup] = fakeSupabase.__buildersFor('research_documents');
    expect(lookup!.eq).toHaveBeenCalledWith('announcement_id', '0001193125-26-401111');
    expect(fakeSupabase.__buildersFor('research_documents').some((b) => b.insert.mock.calls.length > 0)).toBe(false);
  });

  it('recognises a filing registered between its check and its insert', async () => {
    fakeSupabase.__setResponses('research_documents', [
      { data: null, error: null },
      { data: null, error: { message: 'duplicate key', code: '23505' } as never },
      { data: { id: 'doc-raced' }, error: null },
    ]);

    await expect(registerFiling(input())).resolves.toEqual({ ok: true, documentId: 'doc-raced', created: false });
  });

  it('refuses a find with no filing metadata, or a form with no class', async () => {
    await expect(registerFiling(input(null))).resolves.toMatchObject({ ok: false });
    await expect(registerFiling(input({ ...EIGHT_K, form: '424B5' }))).resolves.toMatchObject({
      ok: false,
      error: expect.stringContaining('424B5'),
    });
    expect(fakeSupabase.__buildersFor('research_documents')).toHaveLength(0);
  });
});
