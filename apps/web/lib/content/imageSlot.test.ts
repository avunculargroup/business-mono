import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '@/test/mocks/supabase';
import type { ContentImage } from '@platform/data';
import { hasImageSlot, loadImageSlotData } from './imageSlot';

function client() {
  const bucket = {
    createSignedUrls: vi.fn(async (paths: string[]) => ({
      data: paths.map((p) => ({ path: p, signedUrl: `https://signed/${p}`, error: null })),
      error: null,
    })),
  };
  const supabase = Object.assign(createFakeSupabase(), { storage: { from: vi.fn(() => bucket) } });
  return { supabase, bucket };
}

const IMAGE = { id: 'img-1', storagePath: 'social-images/d/g/linkedin-1200x627.png' } as ContentImage;
const CANDIDATE = { id: 'img-2', storagePath: 'social-images/d/g2/linkedin-1200x627.png' } as ContentImage;

describe('loadImageSlotData', () => {
  it('signs the selected image and its candidates in one batch, and maps the active canon', async () => {
    const { supabase, bucket } = client();
    supabase.__setResponse('brand_visual', {
      data: { id: 'bv-1', version: '1.3', style_block: 'S', motifs: [{ key: 'vault', label: 'Vault' }] },
      error: null,
    });

    const data = await loadImageSlotData(supabase as never, IMAGE, [CANDIDATE]);

    expect(data.image?.url).toBe('https://signed/social-images/d/g/linkedin-1200x627.png');
    expect(data.candidates.map((c) => c.url)).toEqual(['https://signed/social-images/d/g2/linkedin-1200x627.png']);
    expect(bucket.createSignedUrls).toHaveBeenCalledTimes(1);
    expect(bucket.createSignedUrls).toHaveBeenCalledWith([IMAGE.storagePath, CANDIDATE.storagePath], 3600);
    expect(data.canon).toMatchObject({ version: '1.3', motifs: [expect.objectContaining({ key: 'vault' })] });
  });

  it('signs nothing without an image, and has no canon without a row', async () => {
    const { supabase, bucket } = client();
    expect(await loadImageSlotData(supabase as never, null)).toEqual({ image: null, candidates: [], canon: null });
    expect(bucket.createSignedUrls).not.toHaveBeenCalled();
  });
});

describe('hasImageSlot', () => {
  it('is for the two social platforms only', () => {
    expect(hasImageSlot('linkedin')).toBe(true);
    expect(hasImageSlot('twitter_x')).toBe(true);
    expect(hasImageSlot('newsletter')).toBe(false);
  });
});
