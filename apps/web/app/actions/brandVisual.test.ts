import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let supabase: FakeSupabaseClient & { storage: { from: ReturnType<typeof vi.fn> } };
let bucket: { remove: ReturnType<typeof vi.fn> };

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () => ({ ok: true, supabase, user: { id: 'director-1' } })),
}));

import { removeStyleAnchor, saveBrandVisual, type BrandVisualInput } from './brandVisual';

const INPUT: BrandVisualInput = {
  style_block: 'A hand-drawn sketch.',
  composition_block: 'Leave the corner empty.',
  prohibited_block: 'Never include text.',
  prohibited_terms: ['Rocket', 'rocket', 'coin'],
  palette: [{ role: 'Paper', hex: '#FAFAF8', usage: 'warm off-white' }],
  layouts: [{ key: 'left_third', label: 'Left third', description: 'Subject in the left third.', is_active: true }],
  brand_mark: { enabled: true, height_pct: 9, margin_pct: 4 },
};

function updates() {
  return supabase.__buildersFor('brand_visual').flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>));
}

beforeEach(() => {
  bucket = { remove: vi.fn(async () => ({ data: [], error: null })) };
  supabase = Object.assign(createFakeSupabase(), { storage: { from: vi.fn(() => bucket) } });
  revalidatePath.mockClear();
});

describe('saveBrandVisual', () => {
  it('bumps the version, dedupes terms case-insensitively, and keeps the mark position', async () => {
    supabase.__setResponses('brand_visual', [
      { data: { id: 'bv-1', version: '1.0', brand_mark: { opacity: 1, position: 'bottom_right' } }, error: null },
      { data: null, error: null },
    ]);
    expect(await saveBrandVisual(INPUT)).toEqual({ success: true, version: '1.1' });
    expect(updates()[0]).toMatchObject({
      version: '1.1',
      prohibited_terms: ['rocket', 'coin'],
      brand_mark: { opacity: 1, position: 'bottom_right', enabled: true, height_pct: 9, margin_pct: 4 },
      updated_by: 'director-1',
      notes: null,
      layouts: INPUT.layouts,
    });
    // The retired v1.0 motifs stay on the row untouched.
    expect(updates()[0]).not.toHaveProperty('motifs');
  });

  it.each([
    [{ palette: [{ role: 'Paper', hex: 'FAFAF8', usage: '' }] }, /six-digit hex/],
    [{ layouts: [{ ...INPUT.layouts[0]!, is_active: false }] }, /at least one layout active/],
    [{ layouts: [INPUT.layouts[0]!, INPUT.layouts[0]!] }, /unique/],
    [{ layouts: [{ ...INPUT.layouts[0]!, key: 'Left Third' }] }, /lowercase/],
    [{ brand_mark: { enabled: true, height_pct: 40, margin_pct: 4 } }, /between 3% and 20%/],
  ])('rejects %j', async (patch, message) => {
    const res = await saveBrandVisual({ ...INPUT, ...patch } as BrandVisualInput);
    expect(res).toEqual({ error: expect.stringMatching(message) });
    expect(updates()).toEqual([]);
  });
});

describe('removeStyleAnchor', () => {
  it('drops the path, deletes the copy and clears the flag on its crops', async () => {
    supabase.__setResponses('brand_visual', [
      { data: { id: 'bv-1', style_anchor_paths: ['social-images/anchors/g1.png', 'social-images/anchors/g2.png'] }, error: null },
      { data: null, error: null },
    ]);
    expect(await removeStyleAnchor('social-images/anchors/g1.png')).toEqual({ success: true });
    expect(updates()).toEqual([{ style_anchor_paths: ['social-images/anchors/g2.png'] }]);
    expect(bucket.remove).toHaveBeenCalledWith(['social-images/anchors/g1.png']);
    expect(supabase.__buildersFor('content_images')[0]!.eq).toHaveBeenCalledWith('generation_group_id', 'g1');
  });

  it('refuses a path outside the anchors folder', async () => {
    expect(await removeStyleAnchor('social-images/2026-11-08/g1/master-16x9.png')).toEqual({ error: 'That anchor could not be found.' });
  });
});
