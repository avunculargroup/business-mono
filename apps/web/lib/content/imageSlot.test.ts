import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '@/test/mocks/supabase';
import type { ContentImage } from '@platform/data';
import { hasImageSlot, loadImageSlotData } from './imageSlot';

function client() {
  const bucket = { createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null })) };
  const supabase = Object.assign(createFakeSupabase(), { storage: { from: vi.fn(() => bucket) } });
  return { supabase, bucket };
}

const IMAGE = { id: 'img-1', storagePath: 'social-images/d/g/linkedin-1200x627.png' } as ContentImage;

describe('loadImageSlotData', () => {
  it('signs the current image and maps the active canon', async () => {
    const { supabase, bucket } = client();
    supabase.__setResponse('brand_visual', {
      data: { id: 'bv-1', version: '1.3', style_block: 'S', motifs: [{ key: 'vault', label: 'Vault' }] },
      error: null,
    });

    const data = await loadImageSlotData(supabase as never, IMAGE);

    expect(data.image?.url).toBe('https://signed/social-images/d/g/linkedin-1200x627.png');
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(IMAGE.storagePath, 3600);
    expect(data.canon).toMatchObject({ version: '1.3', motifs: [expect.objectContaining({ key: 'vault' })] });
  });

  it('signs nothing without an image, and has no canon without a row', async () => {
    const { supabase, bucket } = client();
    expect(await loadImageSlotData(supabase as never, null)).toEqual({ image: null, canon: null });
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('hasImageSlot', () => {
  it('is for the two social platforms only', () => {
    expect(hasImageSlot('linkedin')).toBe(true);
    expect(hasImageSlot('twitter_x')).toBe(true);
    expect(hasImageSlot('newsletter')).toBe(false);
  });
});
