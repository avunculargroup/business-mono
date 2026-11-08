import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';

// runImageStep with its edges mocked: the agents, the model resolver and the
// OpenRouter call. Paper correction, crop and mark run for real through sharp,
// so the uploaded bytes are genuine PNGs at the platform sizes.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const charlieGenerate = vi.fn();
const lexGenerate = vi.fn();
const generateImage = vi.fn();

const bucket = {
  upload: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
};
(fakeSupabase as unknown as { storage: unknown }).storage = { from: vi.fn(() => bucket) };

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('../../agents/contentCreator/index.js', () => ({ charlie: { generate: charlieGenerate } }));
vi.mock('../../agents/compliance/index.js', () => ({ lex: { generate: lexGenerate } }));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn((k: string) => ({ k })),
  resolveImageModelId: vi.fn(async () => 'google/gemini-2.5-flash-image'),
}));
vi.mock('../../lib/openrouterImage.js', () => ({ generateImage, MAX_REFERENCE_IMAGES: 4 }));

const { runImageStep } = await import('./image.js');

const PIER = {
  tension: 'Nobody knows the trigger, only that the safe ground is shorter than it looks.',
  subject: 'A timber pier running out over open water',
  drawn: 'the near end of the pier, planks and pilings',
  undrawn: 'the far end, planks thinning into pencil guidelines over the water',
  layout: 'left_third',
  alt_text: 'A pencil sketch of a pier whose far end is only outlined.',
};
const BRIDGE = {
  ...PIER,
  tension: 'Everyone is building toward a far side nobody has surveyed.',
  subject: 'A footbridge half built across a gorge',
  drawn: 'the near abutment and first spans',
  undrawn: 'the spans that would reach the far side',
  layout: 'low_horizon',
  alt_text: 'A pencil sketch of a half-built footbridge.',
};
const ROAD = {
  ...PIER,
  tension: 'The safe route ends where the survey ends.',
  subject: 'A surveyed road that stops at a field edge',
  drawn: 'the paved stretch nearest the viewer',
  undrawn: 'the pegged-out route beyond the field',
  layout: 'small_in_space',
  alt_text: 'A pencil sketch of a road that turns into survey pegs.',
};
const BRIEF = { skip: false, skip_reason: null, concepts: [PIER, BRIDGE, ROAD] };

const PARAMS = {
  accountIds: ['acc-li', 'acc-x'],
  story: { id: 'news-0', title: 'Penn Wharton: twenty years', summary: 'Maybe fourteen.', key_points: ['20 years'] },
  form: 'flat_observation',
  postCopy: 'Twenty years. The trigger? Nobody knows.',
  posts: [
    { contentItemId: 'ci-li', platform: 'linkedin' as const },
    { contentItemId: 'ci-x', platform: 'twitter_x' as const },
  ],
  imageSpecs: new Map(),
};

// A render on yellowed paper, as v1.0's hourglass came back.
let parchment: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  process.env['OPENROUTER_API_KEY'] = 'test-key';
  parchment ??= await sharp({ create: { width: 1344, height: 768, channels: 3, background: { r: 236, g: 226, b: 200 } } })
    .png()
    .toBuffer();

  fakeSupabase.__setResponse('brand_visual', { data: BRAND_VISUAL_ROW, error: null });
  fakeSupabase.__setResponse('content_images', { data: [], error: null });
  charlieGenerate.mockResolvedValue({ object: BRIEF });
  lexGenerate.mockResolvedValue({
    object: { classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'describes' },
  });
  generateImage.mockResolvedValue({ image: parchment, mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen-1', referencesDropped: false });
  bucket.upload.mockResolvedValue({ data: {}, error: null });
  bucket.remove.mockResolvedValue({ data: [], error: null });
  bucket.createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }));
});

afterEach(() => {
  delete process.env['OPENROUTER_API_KEY'];
});

function insertedImageRows(): Array<Record<string, unknown>> {
  return fakeSupabase
    .__buildersFor('content_images')
    .flatMap((b) => b.insert.mock.calls.flatMap((c) => c[0] as Array<Record<string, unknown>>));
}

function imageUpdates(): Array<{ patch: Record<string, unknown>; ids: unknown }> {
  return fakeSupabase
    .__buildersFor('content_images')
    .filter((b) => b.update.mock.calls.length > 0)
    .map((b) => ({ patch: b.update.mock.calls[0]![0] as Record<string, unknown>, ids: b.in.mock.calls[0]?.[1] }));
}

function activityRows(): Array<{ action: string; proposed_actions: Array<Record<string, unknown>> }> {
  return fakeSupabase
    .__buildersFor('agent_activity')
    .flatMap((b) => b.insert.mock.calls.flatMap((c) => c[0] as Array<{ action: string; proposed_actions: Array<Record<string, unknown>> }>));
}

/** Answer selectCandidate's read of the set with the rows the inserts wrote. */
function answerSetReadWithInsertedRows() {
  const original = fakeSupabase.from.getMockImplementation()!;
  fakeSupabase.from.mockImplementation((table: string) => {
    const builder = original(table);
    if (table === 'content_images') {
      const select = builder.select;
      builder.select = vi.fn((cols: string) => {
        if (cols === 'id, generation_group_id, review_outcome') {
          builder.__response = {
            data: insertedImageRows().map((r, i) => ({ id: `row-${i}`, generation_group_id: r['generation_group_id'], review_outcome: null })),
            error: null,
          };
        }
        return select(cols);
      });
    }
    return builder;
  });
  return () => fakeSupabase.from.mockImplementation(original);
}

describe('runImageStep', () => {
  it('renders three candidates in parallel into one set, each its own group, and selects the first', async () => {
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome, images } = await runImageStep(PARAMS);

      expect(generateImage).toHaveBeenCalledTimes(3);
      const prompts = generateImage.mock.calls.map((c) => c[0].prompt as string);
      expect(prompts.some((p) => p.includes('Leave as construction lines only: the far end, planks thinning'))).toBe(true);
      expect(prompts.some((p) => p.includes('Layout: Low horizon:'))).toBe(true);

      const rows = insertedImageRows();
      expect(rows).toHaveLength(6); // three candidates × two drafts
      const setIds = new Set(rows.map((r) => r['candidate_set_id']));
      expect(setIds.size).toBe(1);
      expect(new Set(rows.map((r) => r['generation_group_id'])).size).toBe(3);
      expect(rows.every((r) => r['is_selected'] === false)).toBe(true); // selection is made after all settle
      expect(rows.map((r) => r['candidate_index']).sort()).toEqual([0, 0, 1, 1, 2, 2]);
      const pierRow = rows.find((r) => r['candidate_index'] === 0)!;
      expect(pierRow['image_brief']).toEqual(PIER);

      // The lowest index is selected; the morning run's pick marks nothing not_chosen.
      const pierGroup = pierRow['generation_group_id'];
      const updates = imageUpdates();
      const on = updates.find((u) => u.patch['is_selected'] === true)!;
      expect(on.patch).toEqual({ is_selected: true });
      const onRowIds = insertedImageRows()
        .map((r, i) => ({ r, id: `row-${i}` }))
        .filter(({ r }) => r['generation_group_id'] === pierGroup)
        .map(({ id }) => id);
      expect(on.ids).toEqual(onRowIds);
      expect(updates.find((u) => u.patch['is_selected'] === false)!.patch).toEqual({ is_selected: false });

      expect(outcome).toMatchObject({
        status: 'generated',
        generation_group_id: pierGroup,
        candidate_set_id: [...setIds][0],
        candidates: 3,
        layout: 'left_third',
        cost_usd: 0.12,
      });
      expect(images.get('ci-li')).toEqual({ url: expect.stringMatching(/linkedin-1200x627\.png$/), altText: PIER.alt_text, moreOptions: 2 });
    } finally {
      restore();
    }
  });

  it('corrects yellowed paper before cropping, and records the correction on the activity row', async () => {
    await runImageStep(PARAMS);

    const generated = activityRows().filter((r) => r.action === 'social_image_generated');
    expect(generated).toHaveLength(3);
    const paper = generated[0]!.proposed_actions[0]!['paper'] as { sample: number[]; gains: number[]; applied: boolean };
    expect(paper.sample).toEqual([236, 226, 200]);
    expect(paper.applied).toBe(true);
    expect(paper.gains[2]).toBe(1.15);

    // The uploaded master is the corrected one.
    const masterCall = bucket.upload.mock.calls.find((c) => (c[0] as string).endsWith('master-16x9.png'))!;
    const { data } = await sharp(masterCall[1] as Buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThanOrEqual(249);
  });

  it('keeps the other candidates when one render fails, and selects the lowest that succeeded', async () => {
    generateImage.mockImplementation(async ({ prompt }: { prompt: string }) => {
      if (prompt.includes(PIER.subject)) throw new Error('Image render timed out after 120s.');
      return { image: parchment, mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen', referencesDropped: false };
    });
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome, images } = await runImageStep(PARAMS);
      const rows = insertedImageRows();
      expect(new Set(rows.map((r) => r['generation_group_id'])).size).toBe(2);
      expect(outcome).toMatchObject({ status: 'generated', candidates: 2, layout: 'low_horizon' });
      const bridgeGroup = rows.find((r) => r['candidate_index'] === 1)!['generation_group_id'];
      expect(outcome.generation_group_id).toBe(bridgeGroup);
      expect(images.get('ci-x')?.moreOptions).toBe(1);
    } finally {
      restore();
    }
  });

  it('fails when every candidate fails, without writing rows', async () => {
    generateImage.mockRejectedValue(new Error('Image API returned 503'));
    const { outcome, images } = await runImageStep(PARAMS);
    expect(outcome).toMatchObject({ status: 'failed', candidates: 0 });
    expect(outcome.reason).toMatch(/503/);
    expect(insertedImageRows()).toEqual([]);
    expect(images.size).toBe(0);
  });

  it('is disabled when there is no active canon', async () => {
    fakeSupabase.__setResponse('brand_visual', { data: null, error: null });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('disabled');
    expect(charlieGenerate).not.toHaveBeenCalled();
  });

  it('feeds recent subjects and layouts into the brief', async () => {
    fakeSupabase.__setResponses('content_images', [
      {
        data: [
          { candidate_set_id: 's1', generation_group_id: 'g1', is_selected: true, image_brief: { ...PIER, subject: 'A lighthouse on a spit' } },
          { candidate_set_id: 's2', generation_group_id: 'g2', is_selected: true, image_brief: { ...BRIDGE, layout: 'left_third' } },
        ],
        error: null,
      },
    ]);
    await runImageStep(PARAMS);
    const prompt = charlieGenerate.mock.calls[0]![0][0].content as string;
    expect(prompt).toContain('Recent images showed: A lighthouse on a spit; A footbridge half built across a gorge.');
    expect(prompt).toContain('Do not use left_third in any concept.');
    expect(prompt).toContain('Twenty years. The trigger? Nobody knows.');
  });

  it('skips cleanly when the brief chooses not to illustrate', async () => {
    charlieGenerate.mockResolvedValue({ object: { skip: true, skip_reason: 'No honest visual.', concepts: [] } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toEqual({ status: 'skipped', reason: 'No honest visual.' });
    expect(generateImage).not.toHaveBeenCalled();
    expect(activityRows().map((r) => r.action)).toEqual(['social_image_skipped']);
  });

  it('renders only the clean concepts, without a re-brief', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [{ ...PIER, subject: 'An hourglass on a desk' }, BRIDGE, ROAD] } });
    await runImageStep(PARAMS);
    expect(charlieGenerate).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
  });

  it('re-briefs once when no concept is clean, carrying the flags', async () => {
    charlieGenerate
      .mockResolvedValueOnce({ object: { ...BRIEF, concepts: [{ ...PIER, subject: 'An hourglass' }, { ...BRIDGE, undrawn: 'none' }] } })
      .mockResolvedValueOnce({ object: BRIEF });
    const { outcome } = await runImageStep(PARAMS);
    expect(charlieGenerate).toHaveBeenCalledTimes(2);
    const rebrief = charlieGenerate.mock.calls[1]![0][0].content as string;
    expect(rebrief).toContain('- Concept 1: subject names prohibited imagery: hourglass.');
    expect(rebrief).toContain('- Concept 2: undrawn is missing');
    expect(outcome.status).toBe('generated');
  });

  it('skips after a second brief with nothing clean, never looping', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [{ ...PIER, layout: 'centred' }] } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('skipped');
    expect(outcome.reason).toMatch(/failed lint twice/);
    expect(charlieGenerate).toHaveBeenCalledTimes(2);
    expect(generateImage).not.toHaveBeenCalled();
  });

  it('treats a brief call that throws as a skip', async () => {
    charlieGenerate.mockRejectedValue(new Error('model down'));
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toMatchObject({ status: 'skipped', reason: 'Brief generation failed.' });
  });

  it('removes a candidate\'s uploads and writes none of its rows when an upload fails part-way', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [PIER] } });
    bucket.upload
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'quota' } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('failed');
    expect(insertedImageRows()).toEqual([]);
    expect(bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/master-16x9\.png$/)]);
  });

  it('persists with a fail-safe verdict when the alt-text Lex check errors', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [PIER] } });
    lexGenerate.mockRejectedValue(new Error('lex down'));
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    const verdict = insertedImageRows()[0]!['alt_text_verdict'] as { classification: string; rationale: string };
    expect(verdict.classification).toBe('general_advice');
    expect(verdict.rationale).toMatch(/unavailable/);
  });

  it('sends signed style-anchor URLs as references', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [PIER] } });
    fakeSupabase.__setResponse('brand_visual', {
      data: { ...BRAND_VISUAL_ROW, style_anchor_paths: ['social-images/anchors/a.png', 'social-images/anchors/b.png'] },
      error: null,
    });
    await runImageStep(PARAMS);
    expect(generateImage.mock.calls[0]![0].referenceUrls).toEqual([
      'https://signed.example/social-images/anchors/a.png',
      'https://signed.example/social-images/anchors/b.png',
    ]);
  });
});
