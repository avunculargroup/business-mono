import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '@/test/mocks/supabase';

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath }));

type Bucket = { remove: ReturnType<typeof vi.fn>; copy: ReturnType<typeof vi.fn>; createSignedUrl: ReturnType<typeof vi.fn> };
let supabase: FakeSupabaseClient & { storage: { from: ReturnType<typeof vi.fn> } };
let bucket: Bucket;
let authed: boolean;

vi.mock('@/lib/action', () => ({
  getAuthedClient: vi.fn(async () =>
    authed ? { ok: true, supabase, user: { id: 'director-1' } } : { ok: false, error: 'You need to be signed in to do that.' },
  ),
}));

import {
  getImageDownloadUrl,
  promoteImageToStyleAnchor,
  removeImage,
  requestImageRegenerate,
  requestImageRender,
  saveImageAltText,
} from './contentImages';

const ITEM = '2b8f4c1a-0000-4000-8000-000000000001';
const GROUP = '2b8f4c1a-0000-4000-8000-0000000000aa';
const CROPS = [
  { storage_path: `social-images/2026-11-08/${GROUP}/linkedin-1200x627.png` },
  { storage_path: `social-images/2026-11-08/${GROUP}/x-1600x900.png` },
];
const CANON = {
  id: 'bv-1',
  version: '1.0',
  style_block: 'S',
  palette: [],
  composition_block: 'C',
  prohibited_block: 'P',
  prohibited_terms: ['rocket', '$'],
  motifs: [{ key: 'vault', label: 'Vault', description: 'd', use_when: 'u', is_active: true }],
  style_anchor_paths: [] as string[],
  default_aspect_ratio: '16:9',
  brand_mark: {},
};
const BRIEF = { motif_key: 'vault', subject: 'An open strongbox on a desk', metaphor: 'custody', composition: '', alt_text: 'A sketch of a strongbox.' };

function inserts(table: string) {
  return supabase.__buildersFor(table).flatMap((b) => b.insert.mock.calls.map((c) => c[0] as Record<string, unknown>));
}
function updates(table: string) {
  return supabase.__buildersFor(table).flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>));
}

beforeEach(() => {
  bucket = {
    remove: vi.fn(async () => ({ data: [], error: null })),
    copy: vi.fn(async () => ({ data: {}, error: null })),
    createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://signed/${p}` }, error: null })),
  };
  supabase = Object.assign(createFakeSupabase(), { storage: { from: vi.fn(() => bucket) } });
  authed = true;
  revalidatePath.mockClear();
});

describe('requestImageRegenerate', () => {
  it('queues a regenerate request for the agents server', async () => {
    supabase.__setResponses('content_image_requests', [{ data: [], error: null }, { data: null, error: null }]);
    expect(await requestImageRegenerate(ITEM)).toEqual({ success: true });
    expect(inserts('content_image_requests')).toEqual([
      { content_item_id: ITEM, action: 'regenerate', brief: null, requested_by: 'director-1' },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith(`/content/${ITEM}`);
  });

  it('refuses while another image request is open', async () => {
    supabase.__setResponses('content_image_requests', [{ data: [{ id: 'r' }], error: null }]);
    expect(await requestImageRegenerate(ITEM)).toEqual({ error: expect.stringMatching(/already being made/) });
    expect(inserts('content_image_requests')).toEqual([]);
  });

  it('requires a signed-in user and a real id', async () => {
    expect(await requestImageRegenerate('nope')).toEqual({ error: 'That draft could not be found.' });
    authed = false;
    expect(await requestImageRegenerate(ITEM)).toEqual({ error: 'You need to be signed in to do that.' });
  });
});

describe('requestImageRender', () => {
  beforeEach(() => {
    supabase.__setResponse('brand_visual', { data: CANON, error: null });
    supabase.__setResponses('content_image_requests', [{ data: [], error: null }, { data: null, error: null }]);
  });

  it('queues a linted brief, blanks as null', async () => {
    expect(await requestImageRender(ITEM, BRIEF)).toEqual({ success: true });
    expect(inserts('content_image_requests')[0]).toMatchObject({
      action: 'render_brief',
      brief: { skip: false, motif_key: 'vault', composition: null, alt_text: 'A sketch of a strongbox.' },
    });
  });

  it('names the prohibited term instead of queuing', async () => {
    const res = await requestImageRender(ITEM, { ...BRIEF, subject: 'A rocket on a desk' });
    expect(res).toEqual({ error: expect.stringContaining('subject names prohibited imagery: rocket') });
    expect(inserts('content_image_requests')).toEqual([]);
  });

  it('validates the form fields before anything else', async () => {
    expect(await requestImageRender(ITEM, { ...BRIEF, alt_text: ' ' })).toEqual({ error: 'Write the alt text' });
  });

  it('says so when there is no canon', async () => {
    supabase.__setResponse('brand_visual', { data: null, error: null });
    expect(await requestImageRender(ITEM, BRIEF)).toEqual({ error: expect.stringMatching(/no brand visual canon/) });
  });
});

describe('saveImageAltText', () => {
  it('updates the whole group, clears the verdict, and asks Lex to check again', async () => {
    const res = await saveImageAltText({ contentItemId: ITEM, generationGroupId: GROUP, altText: ' A new description. ' });
    expect(res).toEqual({ success: true });
    expect(updates('content_images')).toEqual([{ alt_text: 'A new description.', review_outcome: 'kept', alt_text_verdict: null }]);
    expect(supabase.__buildersFor('content_images')[0]!.eq).toHaveBeenCalledWith('generation_group_id', GROUP);
    expect(inserts('content_image_requests')).toEqual([
      { content_item_id: ITEM, action: 'recheck_alt_text', requested_by: 'director-1' },
    ]);
  });
});

describe('removeImage', () => {
  it('marks the group removed and deletes its crops and master', async () => {
    supabase.__setResponses('content_images', [{ data: CROPS, error: null }, { data: null, error: null }]);
    expect(await removeImage({ contentItemId: ITEM, generationGroupId: GROUP })).toEqual({ success: true });
    expect(updates('content_images')).toEqual([{ review_outcome: 'removed' }]);
    expect(bucket.remove).toHaveBeenCalledWith([...CROPS.map((c) => c.storage_path), `social-images/2026-11-08/${GROUP}/master-16x9.png`]);
  });
});

describe('promoteImageToStyleAnchor', () => {
  beforeEach(() => {
    supabase.__setResponses('content_images', [{ data: CROPS, error: null }, { data: null, error: null }]);
  });

  it('copies the unmarked master to the anchors folder and appends it to the canon', async () => {
    supabase.__setResponses('brand_visual', [{ data: CANON, error: null }, { data: null, error: null }]);
    expect(await promoteImageToStyleAnchor({ contentItemId: ITEM, generationGroupId: GROUP })).toEqual({ success: true });
    expect(bucket.copy).toHaveBeenCalledWith(`social-images/2026-11-08/${GROUP}/master-16x9.png`, `social-images/anchors/${GROUP}.png`);
    expect(updates('brand_visual')).toEqual([{ style_anchor_paths: [`social-images/anchors/${GROUP}.png`] }]);
    expect(updates('content_images')).toEqual([{ is_style_anchor: true }]);
  });

  it('stops at eight anchors', async () => {
    const full = { ...CANON, style_anchor_paths: Array.from({ length: 8 }, (_, i) => `social-images/anchors/${i}.png`) };
    supabase.__setResponses('brand_visual', [{ data: full, error: null }]);
    expect(await promoteImageToStyleAnchor({ contentItemId: ITEM, generationGroupId: GROUP })).toEqual({
      error: expect.stringMatching(/already 8 style anchors/),
    });
    expect(bucket.copy).not.toHaveBeenCalled();
  });

  it('removes the copy if the canon update fails', async () => {
    supabase.__setResponses('brand_visual', [{ data: CANON, error: null }, { data: null, error: { message: 'denied' } }]);
    const res = await promoteImageToStyleAnchor({ contentItemId: ITEM, generationGroupId: GROUP });
    expect(res).toHaveProperty('error');
    expect(bucket.remove).toHaveBeenCalledWith([`social-images/anchors/${GROUP}.png`]);
  });
});

describe('getImageDownloadUrl', () => {
  it('signs a short download link for a social image only', async () => {
    const path = CROPS[0]!.storage_path;
    expect(await getImageDownloadUrl(path)).toEqual({ url: `https://signed/${path}` });
    expect(bucket.createSignedUrl).toHaveBeenCalledWith(path, 300, { download: 'bts-linkedin-1200x627.png' });
    expect(await getImageDownloadUrl('contracts/secret.pdf')).toEqual({ error: 'That image could not be found.' });
  });
});
