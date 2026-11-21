import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';
import { BRAND_VISUAL_ROW } from '../../test/fixtures/brandVisual.js';
import { toBrandVisual } from '@platform/shared';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const renderCandidateSet = vi.fn();
const briefConcepts = vi.fn();
const loadCanon = vi.fn();
const loadImageHistory = vi.fn();
const classifyAltText = vi.fn();
const classifyHeadline = vi.fn();
const logActivity = vi.fn();
const planCard = vi.fn();
const generateImage = vi.fn();
const bucket = { upload: vi.fn(), remove: vi.fn(), download: vi.fn() };
(fakeSupabase as unknown as { storage: unknown }).storage = { from: vi.fn(() => bucket) };

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
  createRealtimeClient: () => fakeSupabase,
}));
vi.mock('../workflows/socialPost/image.js', () => ({
  renderCandidateSet,
  briefConcepts,
  loadCanon,
  loadImageHistory,
  classifyAltText,
  classifyHeadline,
  logActivity,
  planCard,
  headlineCandidates: vi.fn(() => ['Nobody knows the trigger.']),
  cropsFor: vi.fn(() => []),
  storedVerdict: (v: { classification: string; rationale: string }) => ({ classification: v.classification, rationale: v.rationale }),
}));
// A recompose must never reach the image model.
vi.mock('../lib/openrouterImage.js', () => ({ generateImage, MAX_REFERENCE_IMAGES: 4 }));

const {
  cropFromKey,
  handleImageRequestRow,
  masterPathOf,
  normaliseFounderConcept,
  normaliseRecomposeCard,
  platformOfCrop,
  reconcileImageRequests,
} = await import('./contentImageRequestListener.js');

const PIER = {
  tension: 'After years of fog, clarity is coming.',
  symbol: 'A lighthouse',
  twist: 'One solid gold beam cuts through the fog',
  subject: 'A lighthouse throwing one solid gold beam through dense fog',
  layout: 'hero_left',
  alt_text: 'A linocut of a lighthouse with a gold beam through fog.',
};

function row(overrides: Record<string, unknown>) {
  return {
    id: 'r',
    content_item_id: 'ci-li',
    generation_group_id: 'g-a',
    candidate_set_id: 'set-1',
    candidate_index: 0,
    is_selected: true,
    platform_crop: 'linkedin_1200x627',
    image_brief: PIER,
    alt_text: PIER.alt_text,
    review_outcome: null,
    created_at: '2026-11-08T00:00:00Z',
    storage_path: `social-images/2026-11-08/${String(overrides['generation_group_id'] ?? 'g-a')}/${
      String(overrides['platform_crop'] ?? 'linkedin_1200x627') === 'x_1600x900' ? 'x-1600x900.png' : 'linkedin-1200x627.png'
    }`,
    card_type: null as string | null,
    headline: null as string | null,
    kicker: null as string | null,
    master_path: null as string | null,
    ...overrides,
  };
}

// A run's set: candidate A selected, B not, each on both drafts.
const SET = [
  row({ id: 'a-li' }),
  row({ id: 'a-x', content_item_id: 'ci-x', platform_crop: 'x_1600x900' }),
  row({ id: 'b-li', generation_group_id: 'g-b', candidate_index: 1, is_selected: false }),
  row({ id: 'b-x', generation_group_id: 'g-b', candidate_index: 1, is_selected: false, content_item_id: 'ci-x', platform_crop: 'x_1600x900' }),
];

function claim(action: string, brief: unknown = null, card: unknown = null) {
  fakeSupabase.__setResponses('content_image_requests', [
    { data: [{ id: 'req-1', content_item_id: 'ci-li', action, brief, card }], error: null },
  ]);
}

function wireSet(rows = SET) {
  fakeSupabase.__setResponses('content_images', [
    { data: rows.filter((r) => r.content_item_id === 'ci-li'), error: null }, // the item's newest rows
    { data: rows, error: null }, // the set's rows
  ]);
}

/** The final status write on the request row. */
function resolution(): Record<string, unknown> | undefined {
  return fakeSupabase
    .__buildersFor('content_image_requests')
    .flatMap((b) => b.update.mock.calls.map((c) => c[0] as Record<string, unknown>))
    .at(-1);
}

function imageUpdates() {
  return fakeSupabase
    .__buildersFor('content_images')
    .filter((b) => b.update.mock.calls.length > 0)
    .map((b) => ({ patch: b.update.mock.calls[0]![0] as Record<string, unknown>, builder: b }));
}

const OK = { candidateSetId: 'set-2', results: [{ ok: true }], selected: { ok: true, groupId: 'g-new' } };

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  wireSet();
  fakeSupabase.__setResponse('platform_specs', { data: [], error: null });
  loadCanon.mockResolvedValue(toBrandVisual(BRAND_VISUAL_ROW));
  loadImageHistory.mockResolvedValue({ subjects: [], layouts: [] });
  briefConcepts.mockResolvedValue({
    concepts: [PIER],
    review: {
      headlines: { headlines: [], choice: { headline: null, source: 'none', note: null }, hook_repeat: false, kicker: null, kicker_flags: [] },
    },
  });
  renderCandidateSet.mockResolvedValue(OK);
  classifyAltText.mockResolvedValue({ classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'plain' });
  classifyHeadline.mockResolvedValue({ classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'states' });
  planCard.mockReturnValue({ type: 'image_only', reason: 'test' });
  bucket.upload.mockResolvedValue({ data: {}, error: null });
  bucket.remove.mockResolvedValue({ data: [], error: null });
});

/** A stored master of the given size, as storage's download returns it. */
async function storedArt(width: number, height: number) {
  const png = await sharp({ create: { width, height, channels: 3, background: { r: 250, g: 250, b: 248 } } }).png().toBuffer();
  bucket.download.mockResolvedValue({ data: new Blob([new Uint8Array(png)]), error: null });
}

describe('handleImageRequestRow', () => {
  it('ignores rows that are not pending, and requests another handler already claimed', async () => {
    await handleImageRequestRow({ id: 'req-1', status: 'done' });
    expect(fakeSupabase.from).not.toHaveBeenCalled();

    fakeSupabase.__setResponses('content_image_requests', [{ data: [], error: null }]);
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(renderCandidateSet).not.toHaveBeenCalled();
  });

  describe('regenerate', () => {
    it('writes a fresh set from a fresh brief across both drafts, then retires the whole old set', async () => {
      fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', title: 'Twenty years.', body: 'Nobody knows the trigger.', social_account_id: 'acc-li' }, error: null });
      fakeSupabase.__setResponse('agent_activity', { data: { proposed_actions: [{ story_id: 'news-0', form: 'flat_observation' }] }, error: null });
      fakeSupabase.__setResponse('news_items', {
        data: { id: 'news-0', title: 'Penn Wharton', url: 'https://x', summary: 'Twenty years.', key_points: ['20 years'], source_name: 'S', category: 'macro', relevance_score: 1, topic_tags: [], published_at: null },
        error: null,
      });
      briefConcepts.mockResolvedValue({
        concepts: [PIER],
        review: {
          headlines: { headlines: [], choice: { headline: null, source: 'none', note: null }, hook_repeat: false, kicker: 'Bitcoin security', kicker_flags: [] },
        },
      });
      claim('regenerate');

      await handleImageRequestRow({ id: 'req-1', status: 'pending' });

      const ctx = briefConcepts.mock.calls[0]![1];
      expect(ctx.postCopy).toBe('Twenty years.\n\nNobody knows the trigger.');
      expect(ctx.story).toMatchObject({ id: 'news-0', title: 'Penn Wharton' });
      expect(ctx.form).toBe('flat_observation');
      expect(loadImageHistory).toHaveBeenCalledWith(['acc-li']);

      const params = renderCandidateSet.mock.calls[0]![0];
      expect(params).toMatchObject({ concepts: [PIER], triggerType: 'manual', card: { type: 'image_only' } });
      expect(params.candidateSetId).toBeUndefined(); // a new set
      // The card is planned before the render, with the brief's kicker: never the story's category.
      expect(planCard.mock.calls[0]![1]).toEqual(['Nobody knows the trigger.']);
      expect(planCard.mock.calls[0]![2]).toBe('Bitcoin security');
      expect(params.posts).toEqual([
        { contentItemId: 'ci-li', platform: 'linkedin' },
        { contentItemId: 'ci-x', platform: 'twitter_x' },
      ]);

      const retire = imageUpdates().find((u) => u.patch['review_outcome'] === 'regenerated')!;
      expect(retire.patch).toEqual({ review_outcome: 'regenerated', is_selected: false });
      expect(retire.builder.in).toHaveBeenCalledWith('id', ['a-li', 'a-x', 'b-li', 'b-x']);
      expect(resolution()).toMatchObject({ status: 'done', error: null });
    });

    it('briefs from the post alone when the story is not known', async () => {
      fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', title: null, body: 'Post body.', social_account_id: null }, error: null });
      fakeSupabase.__setResponse('agent_activity', { data: null, error: null });
      claim('regenerate');
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(briefConcepts.mock.calls[0]![1]).toMatchObject({ story: null, form: null, postCopy: 'Post body.' });
      expect(resolution()).toMatchObject({ status: 'done' });
    });

    it('keeps the old set when the brief skips, and says why', async () => {
      fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', title: null, body: 'Post.', social_account_id: null }, error: null });
      briefConcepts.mockResolvedValue({ skip: 'No honest visual.' });
      claim('regenerate');
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(renderCandidateSet).not.toHaveBeenCalled();
      expect(imageUpdates()).toEqual([]);
      expect(resolution()).toMatchObject({ status: 'failed', error: 'No new images: No honest visual.' });
    });

    it('keeps the old set when every candidate fails', async () => {
      fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', title: null, body: 'Post.', social_account_id: null }, error: null });
      renderCandidateSet.mockResolvedValue({ candidateSetId: 'set-2', results: [{ ok: false, reason: 'Image render timed out after 120s.' }], selected: null });
      claim('regenerate');
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(imageUpdates()).toEqual([]);
      expect(resolution()).toMatchObject({ status: 'failed', error: 'Image render timed out after 120s.' });
    });
  });

  describe('render_brief', () => {
    it('lints a founder concept, renders it into the current set after its candidates, and selects it', async () => {
      claim('render_brief', { ...PIER, layout: 'close_crop', subject: '  A lighthouse lamp, cropped close  ' });
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      const params = renderCandidateSet.mock.calls[0]![0];
      expect(params.concepts[0]).toMatchObject({ layout: 'close_crop', subject: 'A lighthouse lamp, cropped close' });
      expect(params).toMatchObject({ candidateSetId: 'set-1', startIndex: 2, founderChoice: true });
      expect(imageUpdates()).toEqual([]); // the set is kept; selection moves inside renderCandidateSet
      expect(resolution()).toMatchObject({ status: 'done' });
    });

    it('keeps the selected card\'s headline on the new art', async () => {
      wireSet(SET.map((r) => (r.is_selected ? { ...r, card_type: 'headline', headline: 'Old words.', kicker: 'Interest rates' } : r)));
      planCard.mockReturnValue({ type: 'headline', headline: 'Old words.', kicker: 'Interest rates' });
      claim('render_brief', PIER);
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(planCard.mock.calls[0]!.slice(1, 3)).toEqual([['Old words.'], 'Interest rates']);
      expect(renderCandidateSet.mock.calls[0]![0]).toMatchObject({ card: { type: 'headline', headline: 'Old words.' } });
    });

    it('drops a stored category kicker from before 2026-11-21 rather than carry it onto new art', async () => {
      wireSet(SET.map((r) => (r.is_selected ? { ...r, card_type: 'headline', headline: 'Old words.', kicker: 'MACRO' } : r)));
      claim('render_brief', PIER);
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(planCard.mock.calls[0]!.slice(1, 3)).toEqual([['Old words.'], null]);
    });

    it('fails a concept that names a finance cliché, without rendering', async () => {
      claim('render_brief', { ...PIER, twist: 'A rocket launches from the rock' });
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(renderCandidateSet).not.toHaveBeenCalled();
      expect(String(resolution()!['error'])).toMatch(/needs changes: twist names prohibited imagery: rocket/);
    });

    it('starts a set for a draft with no live image, on that draft alone', async () => {
      fakeSupabase.__setResponses('content_images', [{ data: [row({ review_outcome: 'removed' })], error: null }]);
      fakeSupabase.__setResponse('content_items', { data: { id: 'ci-li', type: 'linkedin' }, error: null });
      claim('render_brief', PIER);
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      const params = renderCandidateSet.mock.calls[0]![0];
      expect(params).toMatchObject({ candidateSetId: undefined, startIndex: 0, posts: [{ contentItemId: 'ci-li', platform: 'linkedin' }] });
    });

    it('retires a v1.0 image that predates candidate sets once the new one is in', async () => {
      const old = [row({ id: 'old-li', candidate_set_id: null, candidate_index: null }), row({ id: 'old-x', candidate_set_id: null, candidate_index: null, content_item_id: 'ci-x', platform_crop: 'x_1600x900' })];
      wireSet(old);
      claim('render_brief', PIER);
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(renderCandidateSet.mock.calls[0]![0]).toMatchObject({ candidateSetId: undefined, startIndex: 0 });
      const retire = imageUpdates().find((u) => u.patch['review_outcome'] === 'regenerated')!;
      expect(retire.builder.in).toHaveBeenCalledWith('id', ['old-li', 'old-x']);
    });
  });

  it('re-checks the selected image\'s alt text and writes the verdict to its group', async () => {
    claim('recheck_alt_text');
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(classifyAltText).toHaveBeenCalledWith(PIER.alt_text);
    const write = imageUpdates()[0]!;
    expect((write.patch['alt_text_verdict'] as { classification: string }).classification).toBe('educational');
    expect(write.builder.eq).toHaveBeenCalledWith('generation_group_id', 'g-a');
    expect(logActivity).toHaveBeenCalledTimes(1);
    expect(resolution()).toMatchObject({ status: 'done' });
  });
});

describe('recompose', () => {
  const SQUARE_SET = SET.map((r) => ({
    ...r,
    card_type: 'headline',
    headline: 'Old words.',
    kicker: 'MACRO',
    alt_text: `“Old words.” — ${PIER.alt_text}`,
    master_path: `social-images/2026-11-08/${r.generation_group_id}/master-1x1.png`,
  }));

  beforeEach(() => {
    fakeSupabase.__setResponse('content_items', { data: { title: null, body: 'Twenty years. Nobody knows the trigger.' }, error: null });
  });

  it('rebuilds the selected group from the stored square art with the new words, without a render', async () => {
    wireSet(SQUARE_SET);
    await storedArt(1024, 1024);
    claim('recompose', null, { show_headline: true, headline: "Nobody knows the trigger.", kicker: 'Company treasuries' });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });

    expect(resolution()).toMatchObject({ status: 'done', error: null });
    expect(generateImage).not.toHaveBeenCalled();
    expect(renderCandidateSet).not.toHaveBeenCalled();
    expect(bucket.download).toHaveBeenCalledWith('social-images/2026-11-08/g-a/master-1x1.png');

    const uploads = bucket.upload.mock.calls.map((c) => c[0] as string);
    expect(uploads).toHaveLength(2);
    expect(uploads.every((p) => /\/g-a\/(linkedin-1200x627|x-1600x900)-\d+\.png$/.test(p))).toBe(true);
    const li = await sharp(bucket.upload.mock.calls.find((c) => (c[0] as string).includes('linkedin'))![1] as Buffer).metadata();
    expect([li.width, li.height]).toEqual([1200, 627]);

    const writes = imageUpdates();
    expect(writes).toHaveLength(2);
    expect(writes[0]!.patch).toMatchObject({
      card_type: 'headline',
      headline: 'Nobody knows the trigger.',
      kicker: 'Company treasuries',
      alt_text: `“Nobody knows the trigger.” — ${PIER.alt_text}`,
      headline_verdict: { classification: 'educational' },
    });
    expect(classifyHeadline).toHaveBeenCalledWith('Nobody knows the trigger.');
    expect(bucket.remove).toHaveBeenCalledWith(['social-images/2026-11-08/g-a/linkedin-1200x627.png', 'social-images/2026-11-08/g-a/x-1600x900.png']);
  });

  it('refuses a kicker that fails lintKicker, without composing', async () => {
    wireSet(SQUARE_SET);
    await storedArt(1024, 1024);
    claim('recompose', null, { show_headline: true, headline: 'Nobody knows the trigger.', kicker: 'Macro' });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(String(resolution()!['error'])).toMatch(/The kicker needs changes: Name the subject, not an internal category/);
    expect(bucket.upload).not.toHaveBeenCalled();
  });

  it('turns the headline off: an image-only card from the square art, the headline gone from the alt text', async () => {
    wireSet(SQUARE_SET);
    await storedArt(1024, 1024);
    claim('recompose', null, { show_headline: false, headline: 'Old words.', kicker: 'MACRO' });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(resolution()).toMatchObject({ status: 'done' });
    expect(imageUpdates()[0]!.patch).toMatchObject({ card_type: 'image_only', headline: null, kicker: null, headline_verdict: null, alt_text: PIER.alt_text });
    expect(classifyHeadline).not.toHaveBeenCalled();
  });

  it('refuses a headline on 16:9 art and leaves the rows unchanged', async () => {
    await storedArt(1344, 768);
    claim('recompose', null, { show_headline: true, headline: 'Nobody knows the trigger.', kicker: null });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(String(resolution()!['error'])).toMatch(/Needs a new image to add a headline/);
    expect(bucket.download).toHaveBeenCalledWith('social-images/2026-11-08/g-a/master-16x9.png');
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(imageUpdates()).toEqual([]);
  });

  it('refuses a headline that fails the lint, naming the flags', async () => {
    wireSet(SQUARE_SET);
    await storedArt(1024, 1024);
    claim('recompose', null, { show_headline: true, headline: 'The best trigger!', kicker: null });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(String(resolution()!['error'])).toMatch(/The headline needs changes: .*exclamation/);
    expect(imageUpdates()).toEqual([]);
  });

  it('removes its new files and leaves the rows when an upload fails', async () => {
    wireSet(SQUARE_SET);
    await storedArt(1024, 1024);
    bucket.upload.mockResolvedValueOnce({ data: {}, error: null }).mockResolvedValueOnce({ data: null, error: { message: 'quota' } });
    claim('recompose', null, { show_headline: true, headline: 'Nobody knows the trigger.', kicker: null });
    await handleImageRequestRow({ id: 'req-1', status: 'pending' });
    expect(resolution()).toMatchObject({ status: 'failed' });
    expect(imageUpdates()).toEqual([]);
    expect(bucket.remove.mock.calls[0]![0]).toHaveLength(1);
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

  it('normalises a founder concept: trims, blanks to empty strings for the linter to name', () => {
    expect(normaliseFounderConcept({ layout: ' hero_left ', symbol: ' A stamp ', subject: '' } as never)).toEqual({
      tension: '',
      symbol: 'A stamp',
      twist: '',
      subject: '',
      layout: 'hero_left',
      alt_text: '',
    });
  });

  it('reads a crop key back to its platform crop', () => {
    expect(cropFromKey('linkedin_1200x627')).toEqual({ platform: 'linkedin', width: 1200, height: 627, cropKey: 'linkedin_1200x627', fileName: 'linkedin-1200x627.png' });
    expect(cropFromKey('x_1600x900')).toMatchObject({ platform: 'twitter_x', fileName: 'x-1600x900.png' });
    expect(cropFromKey('square')).toBeNull();
  });

  it('finds the stored master, or the 16:9 one beside an older row', () => {
    expect(masterPathOf({ master_path: 'a/master-1x1.png', storage_path: 'a/linkedin.png' })).toBe('a/master-1x1.png');
    expect(masterPathOf({ master_path: null, storage_path: 'a/b/linkedin.png' })).toBe('a/b/master-16x9.png');
  });

  it('normalises a recompose payload', () => {
    expect(normaliseRecomposeCard({ show_headline: true, headline: '  Rates   held. ', kicker: ' Interest   rates ' })).toEqual({
      generation_group_id: null,
      show_headline: true,
      headline: 'Rates held.',
      kicker: 'Interest rates',
    });
    expect(normaliseRecomposeCard(null)).toMatchObject({ show_headline: false, headline: null, kicker: null });
  });
});
