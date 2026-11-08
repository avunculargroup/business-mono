import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';
import { BRAND_VISUAL_ROW } from '../../test/fixtures/brandVisual.js';
import { toBrandVisual } from '@platform/shared';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const renderCandidateSet = vi.fn();
const briefConcepts = vi.fn();
const loadCanon = vi.fn();
const loadImageHistory = vi.fn();
const classifyAltText = vi.fn();
const logActivity = vi.fn();

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
  logActivity,
}));

const { handleImageRequestRow, normaliseFounderConcept, platformOfCrop, reconcileImageRequests } = await import(
  './contentImageRequestListener.js'
);

const PIER = {
  tension: 'Nobody knows the trigger.',
  subject: 'A timber pier running out over open water',
  drawn: 'the near end of the pier',
  undrawn: 'the far end, as pencil guidelines over the water',
  layout: 'left_third',
  alt_text: 'A pencil sketch of a pier whose far end is only outlined.',
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

function claim(action: string, brief: unknown = null) {
  fakeSupabase.__setResponses('content_image_requests', [
    { data: [{ id: 'req-1', content_item_id: 'ci-li', action, brief }], error: null },
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
  briefConcepts.mockResolvedValue({ concepts: [PIER] });
  renderCandidateSet.mockResolvedValue(OK);
  classifyAltText.mockResolvedValue({ classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'plain' });
});

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
      claim('regenerate');

      await handleImageRequestRow({ id: 'req-1', status: 'pending' });

      const ctx = briefConcepts.mock.calls[0]![1];
      expect(ctx.postCopy).toBe('Twenty years.\n\nNobody knows the trigger.');
      expect(ctx.story).toMatchObject({ id: 'news-0', title: 'Penn Wharton' });
      expect(ctx.form).toBe('flat_observation');
      expect(loadImageHistory).toHaveBeenCalledWith(['acc-li']);

      const params = renderCandidateSet.mock.calls[0]![0];
      expect(params).toMatchObject({ concepts: [PIER], triggerType: 'manual' });
      expect(params.candidateSetId).toBeUndefined(); // a new set
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
      claim('render_brief', { ...PIER, layout: 'close_detail', subject: '  A rope bridge  ' });
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      const params = renderCandidateSet.mock.calls[0]![0];
      expect(params.concepts[0]).toMatchObject({ layout: 'close_detail', subject: 'A rope bridge' });
      expect(params).toMatchObject({ candidateSetId: 'set-1', startIndex: 2, founderChoice: true });
      expect(imageUpdates()).toEqual([]); // the set is kept; selection moves inside renderCandidateSet
      expect(resolution()).toMatchObject({ status: 'done' });
    });

    it('fails a concept that names a stock symbol, without rendering', async () => {
      claim('render_brief', { ...PIER, subject: 'A clock tower over the harbour' });
      await handleImageRequestRow({ id: 'req-1', status: 'pending' });
      expect(renderCandidateSet).not.toHaveBeenCalled();
      expect(String(resolution()!['error'])).toMatch(/needs changes: subject names prohibited imagery: clock/);
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
    expect(normaliseFounderConcept({ layout: ' left_third ', subject: '' } as never)).toEqual({
      tension: '',
      subject: '',
      drawn: '',
      undrawn: '',
      layout: 'left_third',
      alt_text: '',
    });
  });
});
