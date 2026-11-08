import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';
import { BRAND_VISUAL_V1_ROW } from '../../test/fixtures/brandVisual.js';
import { toBrandVisual } from '@platform/shared';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const renderAndPersistImage = vi.fn();
const loadCanon = vi.fn();
const classifyAltText = vi.fn();
const logActivity = vi.fn();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
  createRealtimeClient: () => fakeSupabase,
}));
vi.mock('../workflows/socialPost/image.js', () => ({ renderAndPersistImage, loadCanon, classifyAltText, logActivity }));

const { handleImageRequestRow, normaliseFounderBrief, platformOfCrop, reconcileImageRequests } = await import(
  './contentImageRequestListener.js'
);

const BRIEF = {
  skip: false,
  skip_reason: null,
  motif_key: 'vault',
  subject: 'A strongbox standing open on a plain desk',
  metaphor: 'custody is a habit',
  composition: null,
  alt_text: 'A pencil sketch of an open strongbox.',
};

const GROUP = [
  { id: 'img-li', content_item_id: 'ci-li', generation_group_id: 'g-old', platform_crop: 'linkedin_1200x627', image_brief: BRIEF, alt_text: BRIEF.alt_text, review_outcome: null, created_at: '2026-11-08T00:00:00Z' },
  { id: 'img-x', content_item_id: 'ci-x', generation_group_id: 'g-old', platform_crop: 'x_1600x900', image_brief: BRIEF, alt_text: BRIEF.alt_text, review_outcome: null, created_at: '2026-11-08T00:00:00Z' },
];

function claim(action: string, brief: unknown = null) {
  fakeSupabase.__setResponses('content_image_requests', [
    { data: [{ id: 'req-1', content_item_id: 'ci-li', action, brief }], error: null },
  ]);
}

/** The final status write on the request row. */
function resolution(): Record<string, unknown> | undefined {
  const writes = fakeSupabase
    .__buildersFor('content_image_requests')
    .flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>));
  return writes.at(-1);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  fakeSupabase.__setResponses('content_images', [
    { data: [GROUP[0]], error: null }, // current group lookup
    { data: GROUP, error: null }, // the group's rows
  ]);
  fakeSupabase.__setResponse('platform_specs', { data: [], error: null });
  loadCanon.mockResolvedValue(toBrandVisual(BRAND_VISUAL_V1_ROW));
  renderAndPersistImage.mockResolvedValue({ ok: true, groupId: 'g-new', motifKey: 'vault', altText: 'a', costUsd: 0.04, cropPaths: new Map() });
  classifyAltText.mockResolvedValue({ classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'plain' });
});

describe('handleImageRequestRow', () => {
  it('ignores rows that are not pending, and requests another handler already claimed', async () => {
    await handleImageRequestRow({ id: 'req-1', status: 'done' });
    expect(fakeSupabase.from).not.toHaveBeenCalled();

    fakeSupabase.__setResponses('content_image_requests', [{ data: [], error: null }]);
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(renderAndPersistImage).not.toHaveBeenCalled();
  });

  it('regenerates with the stored brief across the whole group, then retires the old group', async () => {
    claim('regenerate');
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });

    expect(renderAndPersistImage).toHaveBeenCalledTimes(1);
    const params = renderAndPersistImage.mock.calls[0]![0];
    expect(params.brief).toMatchObject({ motif_key: 'vault', skip: false });
    expect(params.posts).toEqual([
      { contentItemId: 'ci-li', platform: 'linkedin' },
      { contentItemId: 'ci-x', platform: 'twitter_x' },
    ]);
    expect(params.triggerType).toBe('manual');

    const retire = fakeSupabase
      .__buildersFor('content_images')
      .find((b) => b.update.mock.calls.some((c) => (c[0] as { review_outcome?: string }).review_outcome === 'regenerated'));
    expect(retire?.eq).toHaveBeenCalledWith('generation_group_id', 'g-old');
    expect(resolution()).toMatchObject({ status: 'done', error: null });
  });

  it('renders a founder brief after linting it', async () => {
    claim('render_brief', { ...BRIEF, motif_key: 'horizon', subject: '  A low horizon line  ' });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(renderAndPersistImage.mock.calls[0]![0].brief).toMatchObject({ motif_key: 'horizon', subject: 'A low horizon line' });
    expect(resolution()).toMatchObject({ status: 'done' });
  });

  it('fails a founder brief that names prohibited imagery, without rendering', async () => {
    claim('render_brief', { ...BRIEF, subject: 'A rocket over the desk' });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(renderAndPersistImage).not.toHaveBeenCalled();
    expect(resolution()).toMatchObject({ status: 'failed' });
    expect(String(resolution()!['error'])).toMatch(/needs changes: subject names prohibited imagery: rocket/);
  });

  it('renders a founder brief onto this draft alone when it has no live image', async () => {
    fakeSupabase.__setResponses('content_images', [{ data: [{ ...GROUP[0], review_outcome: 'removed' }], error: null }]);
    fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', type: 'linkedin' }, error: null });
    claim('render_brief', BRIEF);
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(renderAndPersistImage.mock.calls[0]![0].posts).toEqual([{ contentItemId: 'ci-li', platform: 'linkedin' }]);
  });

  it('fails regenerate when there is no image, with a message the page can show', async () => {
    fakeSupabase.__setResponses('content_images', [{ data: [], error: null }]);
    claim('regenerate');
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(resolution()).toMatchObject({ status: 'failed', error: 'There is no image to regenerate. Edit the brief to render one.' });
  });

  it('records a render failure on the request', async () => {
    renderAndPersistImage.mockResolvedValue({ ok: false, motifKey: 'vault', reason: 'Image render timed out after 120s.' });
    claim('regenerate');
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(resolution()).toMatchObject({ status: 'failed', error: 'Image render timed out after 120s.' });
  });

  it('re-checks alt text and writes the verdict to every row in the group', async () => {
    claim('recheck_alt_text');
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(classifyAltText).toHaveBeenCalledWith(BRIEF.alt_text);
    const write = fakeSupabase.__buildersFor('content_images').find((b) => b.update.mock.calls.length > 0);
    expect((write!.update.mock.calls[0]![0] as { alt_text_verdict: { classification: string } }).alt_text_verdict.classification).toBe('educational');
    expect(write!.eq).toHaveBeenCalledWith('generation_group_id', 'g-old');
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(resolution()).toMatchObject({ status: 'done' });
  });
});

describe('reconcileImageRequests', () => {
  it('fails stale working requests and runs pending ones', async () => {
    fakeSupabase.__setResponses('content_image_requests', [
      { data: null, error: null }, // stale update
      { data: [{ id: 'req-1', status: 'pending' }], error: null }, // pending sweep
      { data: [], error: null }, // claim lost to another handler
    ]);
    const before = fakeSupabase.__buildersFor('content_image_requests').length;
    await reconcileImageRequests(Date.parse('2026-11-08T01:00:00Z'));
    const builders = fakeSupabase.__buildersFor('content_image_requests').slice(before);
    const stale = builders[0]!;
    expect(stale.update.mock.calls[0]![0]).toMatchObject({ status: 'failed' });
    expect(stale.lt).toHaveBeenCalledWith('updated_at', '2026-11-08T00:45:00.000Z');
    expect(builders).toHaveLength(3); // stale update, pending read, one claim attempt
  });
});

describe('pure helpers', () => {
  it('maps crop keys to platforms', () => {
    expect(platformOfCrop('linkedin_1200x627')).toBe('linkedin');
    expect(platformOfCrop('x_1600x900')).toBe('twitter_x');
    expect(platformOfCrop('square')).toBeNull();
    expect(platformOfCrop(null)).toBeNull();
  });

  it('normalises a founder brief: trims, blanks to null, never a skip', () => {
    expect(normaliseFounderBrief({ motif_key: ' vault ', subject: '', skip: true } as never)).toEqual({
      skip: false,
      skip_reason: null,
      motif_key: 'vault',
      subject: null,
      metaphor: null,
      composition: null,
      alt_text: null,
    });
  });
});
