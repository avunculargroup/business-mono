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

import { recordLexReview } from './complianceReviews';

function input(overrides: Partial<Parameters<typeof recordLexReview>[0]> = {}) {
  return {
    kind: 'template' as const,
    id: 't1',
    notes: 'Read in full. No changes needed.',
    reviewDueDate: '2027-09-12',
    ...overrides,
  };
}

/** The patch object the action handed to `.update()`. */
function patchFor(table: string): Record<string, unknown> {
  const builder = supabase.__buildersFor(table)[0];
  return builder!.update.mock.calls[0]![0] as Record<string, unknown>;
}

beforeEach(() => {
  supabase = createFakeSupabase();
  supabase.__setResponse('prepare_templates', { data: null, error: null });
  supabase.__setResponse('client_library_entries', { data: null, error: null });
  authed = true;
  revalidatePath.mockClear();
});

describe('recordLexReview', () => {
  it('publishes a template, naming the reviewer and when', async () => {
    const result = await recordLexReview(input());

    expect(result).toEqual({ success: true });

    const patch = patchFor('prepare_templates');
    expect(patch.status).toBe('active');
    expect(patch.lex_reviewed_by).toBe('director-1');
    expect(patch.lex_notes).toBe('Read in full. No changes needed.');
    expect(patch.review_due_date).toBe('2027-09-12');
    expect(typeof patch.lex_reviewed_at).toBe('string');
  });

  it('publishes a library entry as published, not active', async () => {
    // The two tables spell the live state differently, and the CHECK constraint
    // on each rejects the other's word.
    await recordLexReview(input({ kind: 'library', id: 'l1' }));

    expect(patchFor('client_library_entries').status).toBe('published');
  });

  it('sets last_reviewed_at on a library entry, because its constraint requires it', async () => {
    await recordLexReview(input({ kind: 'library', id: 'l1' }));

    expect(patchFor('client_library_entries').last_reviewed_at).toEqual(
      expect.any(String),
    );
  });

  it('does not send last_reviewed_at on a template, which has no such column', async () => {
    await recordLexReview(input());

    expect(patchFor('prepare_templates')).not.toHaveProperty('last_reviewed_at');
  });

  it('updates the row it was given and no other', async () => {
    await recordLexReview(input({ id: 'the-one' }));

    const builder = supabase.__buildersFor('prepare_templates')[0];
    expect(builder!.eq).toHaveBeenCalledWith('id', 'the-one');
  });

  it('refuses a review with no note', async () => {
    // The note is the whole audit value of the row. A timestamp and a name do
    // not tell anyone in eighteen months what was checked.
    const result = await recordLexReview(input({ notes: '   ' }));

    expect(result).toEqual({
      error: 'Add a note saying what you reviewed before publishing.',
    });
    expect(supabase.__buildersFor('prepare_templates')).toHaveLength(0);
  });

  it('refuses a malformed review date', async () => {
    const result = await recordLexReview(input({ reviewDueDate: 'next year' }));

    expect(result).toEqual({ error: 'Set the date this should next be reviewed.' });
    expect(supabase.__buildersFor('prepare_templates')).toHaveLength(0);
  });

  it('refuses when nobody is signed in', async () => {
    authed = false;

    const result = await recordLexReview(input());

    expect(result).toEqual({ error: 'You need to be signed in to do that.' });
  });

  it('explains a second active version rather than surfacing the index name', async () => {
    // idx_prepare_templates_one_active. The raw message names an index and the
    // fix is "supersede the live one first", which the raw message does not say.
    supabase.__setResponse('prepare_templates', {
      data: null,
      error: { message: 'duplicate key value', code: '23505' } as never,
    });

    const result = await recordLexReview(input());

    expect(result.error).toMatch(/already live/);
    expect(result.error).toMatch(/Supersede/);
  });

  it('revalidates the queue so the row leaves it', async () => {
    await recordLexReview(input());

    expect(revalidatePath).toHaveBeenCalledWith('/compliance');
  });

  it('does not revalidate when the write failed', async () => {
    supabase.__setResponse('prepare_templates', {
      data: null,
      error: { message: 'permission denied' },
    });

    const result = await recordLexReview(input());

    expect(result.error).toBeTruthy();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
