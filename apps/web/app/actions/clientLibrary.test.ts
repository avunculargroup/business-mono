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
  createLibraryEntry,
  createLibrarySection,
  updateLibraryEntryBody,
} from './clientLibrary';

function inserted(table: string): Record<string, unknown> {
  return supabase.__buildersFor(table)[0]!.insert.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('client_library_sections', { data: null, error: null });
  supabase.__setResponse('client_library_entries', {
    data: { id: 'e1', status: 'draft' },
    error: null,
  });
  authed = true;
  revalidatePath.mockClear();
});

describe('createLibrarySection', () => {
  it('creates a section for a client type', async () => {
    const result = await createLibrarySection({
      key: 'custody-models',
      title: 'Custody models',
      clientType: 'both',
    });

    expect(result).toEqual({ success: true });
    expect(inserted('client_library_sections')).toMatchObject({
      key: 'custody-models',
      title: 'Custody models',
      client_type: 'both',
    });
  });

  it('normalises the key rather than rejecting a capitalised one', async () => {
    await createLibrarySection({ key: '  Custody-Models ', title: 'x', clientType: 'smsf' });

    expect(inserted('client_library_sections').key).toBe('custody-models');
  });

  it('refuses a key with characters that will not survive a URL', async () => {
    // The key is stable and referenced from elsewhere; a title can be reworded
    // freely and a key cannot.
    const result = await createLibrarySection({
      key: 'custody models!',
      title: 'x',
      clientType: 'both',
    });

    expect(result.error).toMatch(/lowercase letters, numbers and hyphens/);
    expect(supabase.__buildersFor('client_library_sections')).toHaveLength(0);
  });

  it('explains a duplicate key rather than surfacing the index', async () => {
    supabase.__setResponse('client_library_sections', {
      data: null,
      error: { message: 'duplicate key', code: '23505' } as never,
    });

    expect((await createLibrarySection({ key: 'a', title: 'x', clientType: 'both' })).error)
      .toMatch(/already exists/);
  });
});

describe('createLibraryEntry', () => {
  const input = {
    sectionId: 's1',
    slug: 'what-custody-means',
    title: 'What custody means',
    body: 'Who can move the asset, and what has to happen first.',
  };

  it('creates the entry as a draft, always', async () => {
    // published_requires_lex_review would reject anything else, and the right
    // response to that constraint is to respect it.
    const result = await createLibraryEntry(input);

    expect(result).toEqual({ success: true });
    expect(inserted('client_library_entries').status).toBe('draft');
  });

  it('defaults regulatory references to an empty array, not null', async () => {
    // The column is NOT NULL with a default; sending null would fail on a
    // constraint rather than read as "none cited".
    await createLibraryEntry(input);

    expect(inserted('client_library_entries').regulatory_references).toEqual([]);
  });

  it('carries references when given', async () => {
    await createLibraryEntry({ ...input, regulatoryReferences: ['SIS Reg 4.09'] });

    expect(inserted('client_library_entries').regulatory_references).toEqual(['SIS Reg 4.09']);
  });

  it('refuses an entry with no body', async () => {
    expect((await createLibraryEntry({ ...input, body: '  ' })).error).toMatch(/not an entry/);
  });

  it('refuses a slug that will not survive a URL', async () => {
    expect((await createLibraryEntry({ ...input, slug: 'What Custody' })).error)
      .toMatch(/lowercase letters/);
  });
});

describe('updateLibraryEntryBody', () => {
  it('saves a draft body', async () => {
    const result = await updateLibraryEntryBody('e1', 'Revised prose.');

    expect(result).toEqual({ success: true });
    const patch = supabase.__buildersFor('client_library_entries')[1]!.update.mock.calls[0]![0];
    expect(patch).toEqual({ body: 'Revised prose.' });
  });

  it('refuses a published body, because a subscriber read it', async () => {
    supabase.__setResponse('client_library_entries', {
      data: { id: 'e1', status: 'published' },
      error: null,
    });

    const result = await updateLibraryEntryBody('e1', 'Revised prose.');

    expect(result.error).toMatch(/new version/);
    expect(supabase.__buildersFor('client_library_entries')).toHaveLength(1);
  });

  it('refuses an empty body', async () => {
    expect((await updateLibraryEntryBody('e1', '')).error).toMatch(/not an entry/);
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;
    expect(await updateLibraryEntryBody('e1', 'x')).toEqual({
      error: 'You need to be signed in to do that.',
    });
  });
});
