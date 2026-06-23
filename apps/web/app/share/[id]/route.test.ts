import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Supabase server client before importing the route.
const createSignedUrl = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ eq, single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const storageFrom = vi.fn(() => ({ createSignedUrl }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from,
    storage: { from: storageFrom },
  })),
}));

import { GET } from './route';

function call(id: string) {
  return GET(new Request(`http://localhost/share/${id}`), {
    params: Promise.resolve({ id }),
  });
}

describe('GET /share/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to a freshly signed URL for a public file', async () => {
    single.mockResolvedValue({ data: { storage_path: 'bts/abc/original.pdf', is_public: true }, error: null });
    createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.example/abc' }, error: null });

    const res = await call('abc');

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://signed.example/abc');
    // Only public rows are eligible — the query must constrain is_public.
    expect(eq).toHaveBeenCalledWith('is_public', true);
  });

  it('returns 404 when no public file matches the id', async () => {
    single.mockResolvedValue({ data: null, error: null });

    const res = await call('missing');

    expect(res.status).toBe(404);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it('returns 404 when the signed URL cannot be created', async () => {
    single.mockResolvedValue({ data: { storage_path: 'bts/abc/original.pdf', is_public: true }, error: null });
    createSignedUrl.mockResolvedValue({ data: null, error: { message: 'nope' } });

    const res = await call('abc');

    expect(res.status).toBe(404);
  });
});
