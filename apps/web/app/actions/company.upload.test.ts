import { describe, it, expect, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

const bucket = {
  createSignedUploadUrl: vi.fn(async (path: string) => ({
    data: { signedUrl: `https://signed/${path}?token=tok`, token: 'tok', path },
    error: null,
  })),
};
const storage = { from: vi.fn(() => bucket) };

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () => ({ ok: true, supabase: { storage }, user: { id: 'director-1' } })),
}));

import { createCompanyUploadSignedUrl } from './company';

describe('createCompanyUploadSignedUrl', () => {
  // uploadToSignedUrl takes the token; handing it the URL fails every upload.
  it('returns the bare upload token, not the signed URL', async () => {
    const res = await createCompanyUploadSignedUrl('logo.png', 'image/png');

    expect(storage.from).toHaveBeenCalledWith('company-assets');
    expect(res).toMatchObject({ success: true, token: 'tok', path: expect.stringMatching(/^[0-9a-f-]{36}\/original\.png$/) });
    expect(res).not.toHaveProperty('signedUrl');
  });
});
