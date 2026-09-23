import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

let supabase: FakeSupabaseClient & { storage: { from: ReturnType<typeof vi.fn> } };
let bucket: { createSignedUploadUrl: ReturnType<typeof vi.fn>; remove: ReturnType<typeof vi.fn> };
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () =>
    authed
      ? { ok: true, supabase, user: { id: 'director-1' } }
      : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  createProductImageUploadUrl,
  deleteProductImage,
  registerProductImage,
  setFeaturedProductImage,
  updateProductImagePosition,
} from './productImages';

const PRODUCT = 'p1';

beforeEach(() => {
  bucket = {
    createSignedUploadUrl: vi.fn(async (path: string) => ({ data: { signedUrl: `https://signed/${path}` }, error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
  };
  supabase = Object.assign(createFakeSupabase(), { storage: { from: vi.fn(() => bucket) } });
  authed = true;
  revalidatePath.mockClear();
});

describe('createProductImageUploadUrl', () => {
  it('mints a path under the product folder in the product-images bucket', async () => {
    const res = await createProductImageUploadUrl(PRODUCT, 'Front.JPG', 'image/jpeg', 1000);

    expect(res).toMatchObject({ success: true });
    expect(supabase.storage.from).toHaveBeenCalledWith('product-images');
    const path = (res as { path: string }).path;
    expect(path).toMatch(/^p1\/[0-9a-f-]{36}\.jpg$/);
  });

  it('refuses a non-image before asking for a URL', async () => {
    const res = await createProductImageUploadUrl(PRODUCT, 'deck.pdf', 'application/pdf', 1000);

    expect(res).toEqual({ error: expect.stringContaining('deck.pdf') });
    expect(bucket.createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('refuses a file over 10 MB', async () => {
    const res = await createProductImageUploadUrl(PRODUCT, 'big.png', 'image/png', 11 * 1024 * 1024);

    expect(res).toEqual({ error: 'big.png is over 10 MB.' });
  });

  it('requires a signed-in user', async () => {
    authed = false;
    const res = await createProductImageUploadUrl(PRODUCT, 'a.png', 'image/png', 10);

    expect(res).toEqual({ error: 'You need to be signed in to do that.' });
  });
});

describe('registerProductImage', () => {
  const params = { productId: PRODUCT, path: 'p1/abc.png', filename: 'a.png', mimeType: 'image/png', byteSize: 10 };

  it('appends after the last image in the gallery', async () => {
    supabase.__setResponse('product_images', { data: { sort_order: 3 }, error: null });

    await registerProductImage(params);

    const insert = supabase.__buildersFor('product_images')[1]!.insert.mock.calls[0]![0];
    expect(insert).toMatchObject({ product_service_id: PRODUCT, storage_path: 'p1/abc.png', sort_order: 4, created_by: 'director-1' });
  });

  it('starts at zero for an empty gallery', async () => {
    supabase.__setResponse('product_images', { data: null, error: null });

    await registerProductImage(params);

    const insert = supabase.__buildersFor('product_images')[1]!.insert.mock.calls[0]![0];
    expect(insert.sort_order).toBe(0);
  });

  it('refuses a path outside the product folder', async () => {
    const res = await registerProductImage({ ...params, path: 'p2/abc.png' });

    expect(res).toEqual({ error: 'That upload does not belong to this product.' });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('removes the uploaded file when the row cannot be written', async () => {
    supabase.__setResponse('product_images', { data: null, error: { message: 'insert failed' } });

    const res = await registerProductImage(params);

    expect(res).toHaveProperty('error');
    expect(bucket.remove).toHaveBeenCalledWith(['p1/abc.png']);
  });
});

describe('setFeaturedProductImage', () => {
  it('points the product at the image', async () => {
    supabase.__setResponse('products_services', { data: null, error: null });

    const res = await setFeaturedProductImage(PRODUCT, 'img-2');

    expect(res).toEqual({ success: true });
    const builder = supabase.__buildersFor('products_services')[0]!;
    expect(builder.update).toHaveBeenCalledWith({ featured_image_id: 'img-2' });
    expect(builder.eq).toHaveBeenCalledWith('id', PRODUCT);
  });
});

describe('updateProductImagePosition', () => {
  it('clamps the point and scopes the write to the product', async () => {
    supabase.__setResponse('product_images', { data: null, error: null });

    await updateProductImagePosition(PRODUCT, 'img-1', 120, 33.4);

    const builder = supabase.__buildersFor('product_images')[0]!;
    expect(builder.update).toHaveBeenCalledWith({ focal_x: 100, focal_y: 33 });
    expect(builder.eq).toHaveBeenCalledWith('product_service_id', PRODUCT);
  });
});

describe('deleteProductImage', () => {
  it('deletes the row, then its file', async () => {
    supabase.__setResponse('product_images', { data: { storage_path: 'p1/abc.png' }, error: null });

    const res = await deleteProductImage(PRODUCT, 'img-1');

    expect(res).toEqual({ success: true });
    expect(bucket.remove).toHaveBeenCalledWith(['p1/abc.png']);
  });

  it('leaves the file alone when the row delete fails', async () => {
    supabase.__setResponse('product_images', { data: null, error: { message: 'nope' } });

    await deleteProductImage(PRODUCT, 'img-1');

    expect(bucket.remove).not.toHaveBeenCalled();
  });
});
