import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

const fakeSupabase = createFakeSupabase();
vi.mock('@platform/db', () => ({ supabase: fakeSupabase }));

const { makeIsTaken, resolveNewsHeadline, finaliseHeadline, pageCandidates } = await import('./newsTitle.js');

const URL_A = 'https://www.legal500.com/developments/thought-leadership/crossing-the-pacific-key-considerations-for-us-fintechs-entering-australia/';

beforeEach(() => {
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  fakeSupabase.from.mockClear();
});

describe('makeIsTaken', () => {
  it('queries once for the candidate set, scoped by source_id, excluding this url', async () => {
    fakeSupabase.__setResponse('news_items', { data: [{ title: 'DECA Bulletin' }], error: null });
    const isTaken = await makeIsTaken({ sourceName: 'DECA', sourceId: 'src-1', url: 'email://deca/2' })(
      ['DECA Bulletin', 'Other title', 'DECA Bulletin'],
    );

    expect(isTaken('DECA Bulletin')).toBe(true);
    expect(isTaken('Other title')).toBe(false);
    const [b] = fakeSupabase.__buildersFor('news_items');
    expect(fakeSupabase.__buildersFor('news_items')).toHaveLength(1);
    expect(b!.in).toHaveBeenCalledWith('title', ['DECA Bulletin', 'Other title']);
    expect(b!.neq).toHaveBeenCalledWith('url', 'email://deca/2');
    expect(b!.eq).toHaveBeenCalledWith('source_id', 'src-1');
  });

  it('ignores rows from the same newsletter (parent and its followed links)', async () => {
    fakeSupabase.__setResponse('news_items', {
      data: [
        { id: 'parent', title: 'Micron: Wishful thinking at its finest', rex_metadata: {} },
        { id: 'sibling', title: 'Sibling headline here', rex_metadata: { from_newsletter_item_id: 'parent' } },
        { id: 'other', title: 'Weekly notes', rex_metadata: {} },
      ],
      error: null,
    });
    const isTaken = await makeIsTaken({ sourceName: 'SA', sourceId: 'src', url: 'https://x/a', relatedIds: ['parent'] })(
      ['Micron: Wishful thinking at its finest', 'Sibling headline here', 'Weekly notes'],
    );
    expect(isTaken('Micron: Wishful thinking at its finest')).toBe(false);
    expect(isTaken('Sibling headline here')).toBe(false);
    expect(isTaken('Weekly notes')).toBe(true);
  });

  it('falls back to source_name when there is no source row', async () => {
    fakeSupabase.__setResponse('news_items', { data: [], error: null });
    await makeIsTaken({ sourceName: 'legal500.com', url: URL_A })(['A title']);
    expect(fakeSupabase.__buildersFor('news_items')[0]!.eq).toHaveBeenCalledWith('source_name', 'legal500.com');
  });

  it('takes nothing when the lookup fails, and skips the query for no candidates', async () => {
    fakeSupabase.__setResponse('news_items', { data: null, error: { message: 'boom' } });
    const isTaken = await makeIsTaken({ sourceName: 's', url: URL_A })(['A title']);
    expect(isTaken('A title')).toBe(false);

    fakeSupabase.from.mockClear();
    await makeIsTaken({ sourceName: 's', url: URL_A })([]);
    expect(fakeSupabase.from).not.toHaveBeenCalled();
  });
});

describe('resolveNewsHeadline + finaliseHeadline', () => {
  it('resolves the Legal 500 page to its h1 and records the rejected template', async () => {
    fakeSupabase.__setResponse('news_items', { data: [], error: null });
    const h = await resolveNewsHeadline({
      candidates: [
        ...pageCandidates({ h1: 'Crossing the Pacific: Key considerations for US FinTechs entering Australia' }),
        { kind: 'search', title: 'Piper Alderman > Australia | Legal 500 law firm profiles | News and developments' },
      ],
      sourceName: 'legal500.com',
      url: URL_A,
    });
    const final = finaliseHeadline(h, 'Ignored because a candidate passed');
    expect(final.title).toBe('Crossing the Pacific: Key considerations for US FinTechs entering Australia');
    expect(final.titleSource).toBeNull(); // the first candidate won outright
  });

  it('uses the model headline only when nothing qualified and it reads as a headline', async () => {
    fakeSupabase.__setResponse('news_items', { data: [], error: null });
    const h = await resolveNewsHeadline({
      candidates: [{ kind: 'search', title: 'Instagram' }],
      sourceName: 'instagram.com',
      url: 'https://www.instagram.com/p/abc',
    });
    expect(h.resolution.needsModelHeadline).toBe(true);

    expect(finaliseHeadline(h, 'Strategy adds 1,000 bitcoin to its treasury')).toEqual({
      title: 'Strategy adds 1,000 bitcoin to its treasury',
      titleSource: { from: 'model', rejected: [{ kind: 'search', title: 'Instagram', reason: 'platform_name' }] },
    });
    expect(finaliseHeadline(h, 'X').title).toBe('Instagram');
    expect(finaliseHeadline(h, null).titleSource?.from).toBe('none');
  });
});
