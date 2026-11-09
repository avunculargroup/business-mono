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
const editorGenerate = vi.fn();
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
vi.mock('../../agents/editorial/index.js', () => ({ editor: { generate: editorGenerate } }));
vi.mock('../../config/model.js', () => ({
  stepRequestContext: vi.fn((k: string) => ({ k })),
  resolveImageModelId: vi.fn(async () => 'google/gemini-2.5-flash-image'),
}));
vi.mock('../../lib/openrouterImage.js', () => ({ generateImage, MAX_REFERENCE_IMAGES: 4 }));
const logInfo = vi.fn();
vi.mock('../../lib/logger.js', async (importActual) => {
  const actual = await importActual<typeof import('../../lib/logger.js')>();
  return { ...actual, createLogger: () => ({ info: logInfo, warn: vi.fn(), error: vi.fn(), debug: vi.fn() }) };
});

const { runImageStep } = await import('./image.js');

const STAMP = {
  tension: 'The rules are about to land, and everyone is waiting for the impact.',
  symbol: 'A rubber stamp',
  twist: 'Giant, its fresh print in gold on a blank sheet',
  subject: 'A giant rubber stamp hovering just above a blank sheet of paper',
  layout: 'hero_left',
  alt_text: 'A linocut of a huge rubber stamp about to come down on a blank page.',
};
const LIGHTHOUSE = {
  tension: 'After years of fog, clarity is coming.',
  symbol: 'A lighthouse',
  twist: 'One solid gold beam cuts through the fog',
  subject: 'A lighthouse throwing one solid gold beam through dense fog',
  layout: 'against_gold',
  alt_text: 'A linocut of a lighthouse with a gold beam through fog.',
};
const GATE = {
  tension: 'A hundred and forty firms are queueing at a door that is not open yet.',
  symbol: 'A turnstile',
  twist: 'Locked, with a long queue of briefcases behind it',
  subject: 'A locked turnstile with a long line of briefcases behind it',
  layout: 'diagonal',
  alt_text: 'A linocut of a locked turnstile with briefcases queued behind it.',
};
const BRIEF = { skip: false, skip_reason: null, hook: 'Twenty years', concepts: [STAMP, LIGHTHOUSE, GATE] };

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

// A bold print on yellowed paper: passes the legibility gate, and the paper
// correction has cream to fix. And a faint one, which the gate rejects.
let parchment: Buffer;
let faint: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  process.env['OPENROUTER_API_KEY'] = 'test-key';
  if (!parchment) {
    const block = await sharp({ create: { width: 600, height: 520, channels: 3, background: { r: 26, g: 25, b: 21 } } }).png().toBuffer();
    parchment = await sharp({ create: { width: 1344, height: 768, channels: 3, background: { r: 236, g: 226, b: 200 } } })
      .composite([{ input: block, left: 120, top: 120 }])
      .png()
      .toBuffer();
    faint = await sharp({ create: { width: 1344, height: 768, channels: 3, background: { r: 236, g: 226, b: 200 } } }).png().toBuffer();
  }

  fakeSupabase.__setResponse('brand_visual', { data: BRAND_VISUAL_ROW, error: null });
  fakeSupabase.__setResponse('content_images', { data: [], error: null });
  charlieGenerate.mockResolvedValue({ object: BRIEF });
  // No usable review by default: the shortlist is the brief's order.
  editorGenerate.mockResolvedValue({ object: null });
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
      expect(prompts.some((p) => p.includes('The twist: One solid gold beam cuts through the fog'))).toBe(true);
      expect(prompts.some((p) => p.includes('Layout: Against gold:'))).toBe(true);

      const rows = insertedImageRows();
      expect(rows).toHaveLength(6); // three candidates × two drafts
      const setIds = new Set(rows.map((r) => r['candidate_set_id']));
      expect(setIds.size).toBe(1);
      expect(new Set(rows.map((r) => r['generation_group_id'])).size).toBe(3);
      expect(rows.every((r) => r['is_selected'] === false)).toBe(true); // selection is made after all settle
      expect(rows.map((r) => r['candidate_index']).sort()).toEqual([0, 0, 1, 1, 2, 2]);
      const stampRow = rows.find((r) => r['candidate_index'] === 0)!;
      expect(stampRow['image_brief']).toEqual({ ...STAMP, hook: 'Twenty years', review: null });

      // The lowest index is selected; the morning run's pick marks nothing not_chosen.
      const stampGroup = stampRow['generation_group_id'];
      const updates = imageUpdates();
      const on = updates.find((u) => u.patch['is_selected'] === true)!;
      expect(on.patch).toEqual({ is_selected: true });
      const onRowIds = insertedImageRows()
        .map((r, i) => ({ r, id: `row-${i}` }))
        .filter(({ r }) => r['generation_group_id'] === stampGroup)
        .map(({ id }) => id);
      expect(on.ids).toEqual(onRowIds);
      expect(updates.find((u) => u.patch['is_selected'] === false)!.patch).toEqual({ is_selected: false });

      expect(outcome).toMatchObject({
        status: 'generated',
        generation_group_id: stampGroup,
        candidate_set_id: [...setIds][0],
        candidates: 3,
        layout: 'hero_left',
        cost_usd: 0.12,
      });
      expect(images.get('ci-li')).toEqual({ url: expect.stringMatching(/linkedin-1200x627\.png$/), altText: STAMP.alt_text, moreOptions: 2 });
    } finally {
      restore();
    }
  });

  it('corrects yellowed paper before cropping, and records the correction on the activity row', async () => {
    await runImageStep(PARAMS);

    const generated = activityRows().filter((r) => r.action === 'social_image_generated');
    expect(generated).toHaveLength(3);
    const actions = generated[0]!.proposed_actions[0]!;
    expect(actions['bars']).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
    expect(actions['coverage']).toBeGreaterThan(0.2);
    const paper = actions['paper'] as { sample: number[]; gains: number[]; applied: boolean };
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
      if (prompt.includes(STAMP.subject)) throw new Error('Image render timed out after 120s.');
      return { image: parchment, mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen', referencesDropped: false };
    });
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome, images } = await runImageStep(PARAMS);
      const rows = insertedImageRows();
      expect(new Set(rows.map((r) => r['generation_group_id'])).size).toBe(2);
      expect(outcome).toMatchObject({ status: 'generated', candidates: 2, layout: 'against_gold' });
      const lighthouseGroup = rows.find((r) => r['candidate_index'] === 1)!['generation_group_id'];
      expect(outcome.generation_group_id).toBe(lighthouseGroup);
      expect(images.get('ci-x')?.moreOptions).toBe(1);
    } finally {
      restore();
    }
  });

  it('drops a candidate the legibility gate rejects, keeps the others, and records the rejection', async () => {
    generateImage.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      image: prompt.includes(STAMP.subject) ? faint : parchment,
      mediaType: 'image/png',
      costUsd: 0.04,
      generationRef: 'gen',
      referencesDropped: false,
    }));
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome } = await runImageStep(PARAMS);
      const rows = insertedImageRows();
      expect(new Set(rows.map((r) => r['generation_group_id'])).size).toBe(2);
      expect(rows.some((r) => r['candidate_index'] === 0)).toBe(false);
      expect(outcome).toMatchObject({ status: 'generated', candidates: 2, layout: 'against_gold' });
      expect(outcome.generation_group_id).toBe(rows.find((r) => r['candidate_index'] === 1)!['generation_group_id']);

      const rejected = activityRows().find((r) => r.action === 'social_image_rejected')!;
      expect(rejected.proposed_actions[0]!['rejected']).toEqual([
        { candidate_index: 0, reason: expect.stringMatching(/too faint/), coverage: 0 },
      ]);
      // Nothing of the rejected render was uploaded.
      expect(bucket.upload.mock.calls.length).toBe(6); // two candidates × (master + two crops)
    } finally {
      restore();
    }
  });

  it('drops a render whose corner shows a table, records its corners, and keeps the others', async () => {
    const wood = await sharp({ create: { width: 140, height: 120, channels: 3, background: { r: 150, g: 110, b: 70 } } }).png().toBuffer();
    const onTable = await sharp(parchment).composite([{ input: wood, left: 0, top: 0 }]).png().toBuffer();
    generateImage.mockImplementation(async ({ prompt }: { prompt: string }) => ({
      image: prompt.includes(STAMP.subject) ? onTable : parchment,
      mediaType: 'image/png',
      costUsd: 0.04,
      generationRef: 'gen',
      referencesDropped: false,
    }));
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome } = await runImageStep(PARAMS);
      expect(outcome).toMatchObject({ status: 'generated', candidates: 2 });
      expect(insertedImageRows().some((r) => r['candidate_index'] === 0)).toBe(false);
      const rejected = activityRows().find((r) => r.action === 'social_image_rejected')!.proposed_actions[0]!['rejected'] as Array<
        Record<string, unknown>
      >;
      expect(rejected).toEqual([
        {
          candidate_index: 0,
          reason: 'corner off-palette — likely a photographed print',
          coverage: null,
          corners: { samples: expect.any(Array), distances: expect.any(Array) },
        },
      ]);
      const corners = rejected[0]!['corners'] as { distances: number[] };
      expect(corners.distances[0]).toBeGreaterThan(45);
      expect(corners.distances.slice(1).every((d) => d <= 45)).toBe(true);
      // Kept renders carry their corner distances too.
      const generated = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
      expect((generated['corners'] as number[]).every((d) => d <= 45)).toBe(true);
    } finally {
      restore();
    }
  });

  it('fails, with the reasons, when every candidate is rejected', async () => {
    generateImage.mockResolvedValue({ image: faint, mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen', referencesDropped: false });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toMatchObject({ status: 'failed', candidates: 0 });
    expect(outcome.reason).toMatch(/too faint/);
    expect(insertedImageRows()).toEqual([]);
    expect(activityRows().find((r) => r.action === 'social_image_rejected')!.proposed_actions[0]!['rejected']).toHaveLength(3);
  });

  it('strips letterbox bars before the paper sample, so the correction still applies', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [STAMP] } });
    const black = await sharp({ create: { width: 1344, height: 72, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const boxed = await sharp(parchment)
      .composite([
        { input: black, left: 0, top: 0 },
        { input: black, left: 0, top: 768 - 72 },
      ])
      .png()
      .toBuffer();
    generateImage.mockResolvedValue({ image: boxed, mediaType: 'image/png', costUsd: 0.04, generationRef: 'gen', referencesDropped: false });

    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    const actions = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
    expect(actions['bars']).toEqual({ top: 72, bottom: 72, left: 0, right: 0 });
    expect((actions['paper'] as { applied: boolean; sample: number[] })).toMatchObject({ applied: true, sample: [236, 226, 200] });
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
          { candidate_set_id: 's1', generation_group_id: 'g1', is_selected: true, image_brief: { ...STAMP, symbol: 'A padlock', layout: 'diagonal' } },
          { candidate_set_id: 's2', generation_group_id: 'g2', is_selected: true, image_brief: { ...LIGHTHOUSE, layout: 'diagonal' } },
        ],
        error: null,
      },
    ]);
    await runImageStep(PARAMS);
    const prompt = charlieGenerate.mock.calls[0]![0][0].content as string;
    expect(prompt).toContain('Recent images used: A padlock; A lighthouse. Do not use any of these symbols again.');
    expect(prompt).toContain('Do not use diagonal in any concept.');
    expect(prompt).toContain('Twenty years. The trigger? Nobody knows.');
  });

  it('skips cleanly when the brief chooses not to illustrate', async () => {
    charlieGenerate.mockResolvedValue({ object: { skip: true, skip_reason: 'No honest visual.', hook: '', concepts: [] } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toEqual({ status: 'skipped', reason: 'No honest visual.' });
    expect(generateImage).not.toHaveBeenCalled();
    expect(activityRows().map((r) => r.action)).toEqual(['social_image_skipped']);
  });

  it('renders only the clean concepts, without a re-brief', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [{ ...STAMP, subject: 'A stamp over a rocket' }, LIGHTHOUSE, GATE] } });
    await runImageStep(PARAMS);
    expect(charlieGenerate).toHaveBeenCalledTimes(1);
    expect(generateImage).toHaveBeenCalledTimes(2);
  });

  it('re-briefs once when no concept is clean, carrying the flags', async () => {
    charlieGenerate
      .mockResolvedValueOnce({ object: { ...BRIEF, concepts: [{ ...STAMP, symbol: 'A rocket' }, { ...LIGHTHOUSE, twist: 'a lighthouse' }] } })
      .mockResolvedValueOnce({ object: BRIEF });
    const { outcome } = await runImageStep(PARAMS);
    expect(charlieGenerate).toHaveBeenCalledTimes(2);
    const rebrief = charlieGenerate.mock.calls[1]![0][0].content as string;
    expect(rebrief).toContain('- Concept 1: symbol names prohibited imagery: rocket.');
    expect(rebrief).toContain('- Concept 2: twist only restates the symbol');
    expect(outcome.status).toBe('generated');
  });

  it('skips after a second brief with nothing clean, never looping', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [{ ...STAMP, layout: 'centred' }] } });
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
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [STAMP] } });
    bucket.upload
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'quota' } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('failed');
    expect(insertedImageRows()).toEqual([]);
    expect(bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/master-16x9\.png$/)]);
  });

  it('persists with a fail-safe verdict when the alt-text Lex check errors', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [STAMP] } });
    lexGenerate.mockRejectedValue(new Error('lex down'));
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    const verdict = insertedImageRows()[0]!['alt_text_verdict'] as { classification: string; rationale: string };
    expect(verdict.classification).toBe('general_advice');
    expect(verdict.rationale).toMatch(/unavailable/);
  });

  it('renders the reviewer\'s top pick as candidate 0 and selects it, storing the hook and review', async () => {
    const SCALE = { ...STAMP, symbol: 'A balance scale', twist: 'The weighted pan sits higher', subject: 'A balance scale, weighted pan high' };
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, hook: 'capital buffers', concepts: [SCALE, STAMP, LIGHTHOUSE, GATE] } });
    editorGenerate.mockResolvedValue({
      object: {
        scores: [
          { index: 1, recognisable: 5, twist_visible: 3, on_hook: 3, physics_ok: false, needs_text: false, note: 'Weighted pan is high.' },
          { index: 2, recognisable: 4, twist_visible: 4, on_hook: 3, physics_ok: true, needs_text: false, note: 'Stamp, fine.' },
          { index: 3, recognisable: 5, twist_visible: 4, on_hook: 5, physics_ok: true, needs_text: false, note: 'Lands the hook.' },
          { index: 4, recognisable: 4, twist_visible: 3, on_hook: 3, physics_ok: true, needs_text: false, note: 'Queue reads.' },
        ],
      },
    });
    const restore = answerSetReadWithInsertedRows();
    try {
      const { outcome } = await runImageStep(PARAMS);
      const rows = insertedImageRows();
      const top = rows.find((r) => r['candidate_index'] === 0)!;
      expect(top['image_brief']).toEqual({
        ...LIGHTHOUSE,
        hook: 'capital buffers',
        review: { recognisable: 5, twist_visible: 4, on_hook: 5, physics_ok: true, needs_text: false, note: 'Lands the hook.', total: 14, rank: 1 },
      });
      expect(rows.find((r) => r['candidate_index'] === 1)!['image_brief']).toMatchObject({ symbol: 'A rubber stamp' });
      expect(rows.find((r) => r['candidate_index'] === 2)!['image_brief']).toMatchObject({ symbol: 'A turnstile' });
      expect(rows.some((r) => (r['image_brief'] as { symbol: string }).symbol === 'A balance scale')).toBe(false);
      expect(outcome).toMatchObject({ status: 'generated', generation_group_id: top['generation_group_id'], layout: 'against_gold' });
      expect(editorGenerate.mock.calls[0]![1].requestContext).toEqual({ k: 'social_post.image_critic' });

      // Every concept's scores and fate, dropped ones with their reason.
      const actions = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
      expect(actions['hook']).toBe('capital buffers');
      expect(actions['review_fallback']).toBe(false);
      expect(actions['review_rounds']).toBe(1);
      expect(actions['review']).toEqual([
        expect.objectContaining({ index: 1, symbol: 'A balance scale', outcome: 'dropped', reason: 'physics reads wrong', rank: null }),
        expect.objectContaining({ index: 2, symbol: 'A rubber stamp', outcome: 'shortlisted', rank: 2, total: 11 }),
        expect.objectContaining({ index: 3, symbol: 'A lighthouse', outcome: 'shortlisted', rank: 1, total: 14 }),
        expect.objectContaining({ index: 4, symbol: 'A turnstile', outcome: 'shortlisted', rank: 3, total: 10 }),
      ]);
    } finally {
      restore();
    }
  });

  describe('acting on the reviewer', () => {
    const SCORE = (index: number, r: number, t: number, h: number, extra: Record<string, unknown> = {}) => ({
      index,
      recognisable: r,
      twist_visible: t,
      on_hook: h,
      physics_ok: true,
      needs_text: false,
      note: `note ${index}`,
      ...extra,
    });
    const FOOTBALL = { ...STAMP, symbol: 'A football on a kicking tee', twist: 'The touchline painted in gold', subject: 'A football on a tee on a freshly marked pitch' };
    const WHISTLE = { ...STAMP, symbol: "A referee's whistle", twist: 'Solid gold, on a black lanyard', subject: "A gold referee's whistle" };
    // Round one: only the lighthouse passes.
    const ROUND1 = { scores: [SCORE(1, 2, 4, 4), SCORE(2, 5, 4, 5), SCORE(3, 3, 2, 3)] };

    const roundTwoOf = () =>
      activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!['round_two'] as Record<string, unknown>;
    const reviewOf = () =>
      activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!['review'] as Array<Record<string, unknown>>;

    it('records round two as not needed when three or more pass round one', async () => {
      editorGenerate.mockResolvedValueOnce({ object: { scores: [SCORE(1, 4, 4, 4), SCORE(2, 5, 4, 5), SCORE(3, 4, 3, 4)] } });
      await runImageStep(PARAMS);
      expect(charlieGenerate).toHaveBeenCalledTimes(1);
      expect(roundTwoOf()).toEqual({ status: 'not_needed', reason: '3 of 3 passed in round one' });
    });

    it('records round two as not needed, with the reason, when round one\'s review was unusable', async () => {
      editorGenerate.mockResolvedValueOnce({ object: null });
      await runImageStep(PARAMS);
      expect(roundTwoOf()).toMatchObject({ status: 'not_needed', reason: expect.stringMatching(/round one review unusable \(no critique returned\)/) });
    });

    it('records a round two that ran', async () => {
      charlieGenerate
        .mockResolvedValueOnce({ object: BRIEF })
        .mockResolvedValueOnce({ object: { ...BRIEF, concepts: [FOOTBALL, WHISTLE, { ...LIGHTHOUSE, symbol: 'a lighthouse' }] } });
      editorGenerate
        .mockResolvedValueOnce({ object: ROUND1 })
        .mockResolvedValueOnce({ object: { scores: [SCORE(1, 5, 4, 5), SCORE(2, 4, 4, 3)] } });
      await runImageStep(PARAMS);
      expect(roundTwoOf()).toEqual({ status: 'ran', concepts_returned: 3, fresh_clean: 2 });
    });

    it('records a second brief that skipped', async () => {
      charlieGenerate.mockResolvedValueOnce({ object: BRIEF }).mockRejectedValueOnce(new Error('brief down'));
      editorGenerate.mockResolvedValueOnce({ object: ROUND1 });
      await runImageStep(PARAMS);
      expect(roundTwoOf()).toEqual({ status: 'brief_skipped', reason: 'Brief generation failed.', concepts_returned: 0 });
      expect(activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!['review_rounds']).toBe(1);
    });

    it('records a second brief with nothing new: how many repeated round one', async () => {
      charlieGenerate
        .mockResolvedValueOnce({ object: BRIEF })
        .mockResolvedValueOnce({ object: { ...BRIEF, concepts: [{ ...LIGHTHOUSE, symbol: 'A Lighthouse.' }, { ...GATE, symbol: 'a turnstile' }] } });
      editorGenerate.mockResolvedValueOnce({ object: ROUND1 });
      await runImageStep(PARAMS);
      expect(editorGenerate).toHaveBeenCalledTimes(1);
      expect(roundTwoOf()).toEqual({
        status: 'no_fresh_concepts',
        reason: '2 clean concepts repeated a round-one symbol',
        concepts_returned: 2,
        fresh_clean: 0,
      });
    });

    it('records an unusable second review by its index problem, and still logs round two\'s concepts', async () => {
      charlieGenerate.mockResolvedValueOnce({ object: BRIEF }).mockResolvedValueOnce({ object: { ...BRIEF, concepts: [FOOTBALL, WHISTLE] } });
      // The reviewer carried on round one's numbering: 4 and 5 for a list of two.
      editorGenerate.mockResolvedValueOnce({ object: ROUND1 }).mockResolvedValueOnce({ object: { scores: [SCORE(4, 5, 5, 5), SCORE(5, 4, 4, 4)] } });
      await runImageStep(PARAMS);

      expect(roundTwoOf()).toEqual({ status: 'critique_unusable', reason: 'indices outside 1–2: 4, 5', concepts_returned: 2, fresh_clean: 2 });
      const review = reviewOf();
      expect(review.filter((c) => c['round'] === 2).map((c) => [c['symbol'], c['outcome'], c['total']])).toEqual([
        ['A football on a kicking tee', 'not_shortlisted', null],
        ["A referee's whistle", 'not_shortlisted', null],
      ]);
      // Selection is unchanged: round one stands, the gaps filled from its soft rejects.
      const rows = insertedImageRows();
      expect(rows.some((r) => (r['image_brief'] as { symbol: string }).symbol === 'A football on a kicking tee')).toBe(false);
    });

    it('keeps the in-range scores of a second review that scored a concept twice', async () => {
      charlieGenerate.mockResolvedValueOnce({ object: BRIEF }).mockResolvedValueOnce({ object: { ...BRIEF, concepts: [FOOTBALL, WHISTLE] } });
      editorGenerate
        .mockResolvedValueOnce({ object: ROUND1 })
        .mockResolvedValueOnce({ object: { scores: [SCORE(1, 5, 4, 5), SCORE(1, 3, 3, 3), SCORE(2, 4, 4, 4)] } });
      await runImageStep(PARAMS);
      expect(roundTwoOf()).toMatchObject({ status: 'critique_unusable', reason: 'scored twice: 1' });
      expect(reviewOf().filter((c) => c['round'] === 2).map((c) => [c['symbol'], c['total']])).toEqual([
        ['A football on a kicking tee', 14],
        ["A referee's whistle", 12],
      ]);
    });

    it('re-briefs once with the reviewer\'s notes when fewer than three pass, and renders round two\'s survivors', async () => {
      charlieGenerate
        .mockResolvedValueOnce({ object: BRIEF })
        .mockResolvedValueOnce({ object: { ...BRIEF, concepts: [FOOTBALL, WHISTLE, { ...LIGHTHOUSE, symbol: 'a lighthouse' }] } });
      editorGenerate
        .mockResolvedValueOnce({ object: ROUND1 })
        .mockResolvedValueOnce({ object: { scores: [SCORE(1, 5, 4, 5), SCORE(2, 4, 4, 3)] } });

      await runImageStep(PARAMS);

      expect(charlieGenerate).toHaveBeenCalledTimes(2);
      const rebrief = charlieGenerate.mock.calls[1]![0][0].content as string;
      expect(rebrief).toContain('## Re-brief: a reviewer rejected these concepts');
      expect(rebrief).toContain('- A rubber stamp: note 1 (lowest: recognisable 2)');
      expect(rebrief).toContain('Do not reuse any of these symbols: A rubber stamp; A lighthouse; A turnstile.');
      // The repeated lighthouse never reaches the second review.
      const review2 = editorGenerate.mock.calls[1]![0][0].content as string;
      expect(review2).toContain('1. Symbol: A football on a kicking tee');
      expect(review2).not.toContain('a lighthouse');

      const rows = insertedImageRows();
      const byIndex = (i: number) => (rows.find((r) => r['candidate_index'] === i)!['image_brief'] as { symbol: string }).symbol;
      // Lighthouse and football both total 14: brief order (round one first) breaks the tie.
      expect([byIndex(0), byIndex(1), byIndex(2)]).toEqual(['A lighthouse', 'A football on a kicking tee', "A referee's whistle"]);

      const actions = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
      expect(actions['review_rounds']).toBe(2);
      const review = actions['review'] as Array<Record<string, unknown>>;
      expect(review.map((c) => [c['round'], c['symbol'], c['outcome'], c['filled_from_rejected']])).toEqual([
        [1, 'A rubber stamp', 'dropped', false],
        [1, 'A lighthouse', 'shortlisted', false],
        [1, 'A turnstile', 'dropped', false],
        [2, 'A football on a kicking tee', 'shortlisted', false],
        [2, "A referee's whistle", 'shortlisted', false],
      ]);
    });

    it('keeps round one, filling from its best soft rejects, when the second review fails', async () => {
      charlieGenerate.mockResolvedValueOnce({ object: BRIEF }).mockResolvedValueOnce({ object: { ...BRIEF, concepts: [FOOTBALL] } });
      editorGenerate.mockResolvedValueOnce({ object: ROUND1 }).mockRejectedValueOnce(new Error('editor down'));

      await runImageStep(PARAMS);

      const rows = insertedImageRows();
      const byIndex = (i: number) => (rows.find((r) => r['candidate_index'] === i)!['image_brief'] as { symbol: string }).symbol;
      expect([byIndex(0), byIndex(1), byIndex(2)]).toEqual(['A lighthouse', 'A rubber stamp', 'A turnstile']);
      const actions = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
      expect(actions['review_rounds']).toBe(1);
      expect(actions['review_fallback']).toBe(false);
      expect((actions['review'] as Array<Record<string, unknown>>).filter((c) => c['filled_from_rejected']).map((c) => c['symbol'])).toEqual([
        'A rubber stamp',
        'A turnstile',
      ]);
    });

    it('never fills a slot with a concept that needs text or gets its physics wrong', async () => {
      charlieGenerate.mockResolvedValueOnce({ object: BRIEF }).mockRejectedValueOnce(new Error('brief down'));
      editorGenerate.mockResolvedValueOnce({
        object: { scores: [SCORE(1, 5, 5, 5, { needs_text: true }), SCORE(2, 5, 4, 5), SCORE(3, 5, 5, 5, { physics_ok: false })] },
      });

      const { outcome } = await runImageStep(PARAMS);

      expect(generateImage).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: 'generated', candidates: 1, layout: 'against_gold' });
      expect((insertedImageRows()[0]!['image_brief'] as { symbol: string }).symbol).toBe('A lighthouse');
    });
  });

  it('reviews a brief that came back short instead of skipping it, and logs it once', async () => {
    // BRIEF has three concepts, not six: the model came back short.
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    expect(editorGenerate).toHaveBeenCalled();
    const short = logInfo.mock.calls.filter((c) => c[1] === 'brief returned fewer concepts than asked');
    expect(short).toEqual([[{ count: 3 }, 'brief returned fewer concepts than asked']]);
  });

  it('renders in brief order when the reviewer throws, with review_fallback recorded', async () => {
    editorGenerate.mockRejectedValue(new Error('editor down'));
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toMatchObject({ status: 'generated', candidates: 3 });
    const rows = insertedImageRows();
    expect(rows.find((r) => r['candidate_index'] === 0)!['image_brief']).toEqual({ ...STAMP, hook: 'Twenty years', review: null });
    expect(rows.find((r) => r['candidate_index'] === 2)!['image_brief']).toMatchObject({ symbol: 'A turnstile' });
    const actions = activityRows().find((r) => r.action === 'social_image_generated')!.proposed_actions[0]!;
    expect(actions['review_fallback']).toBe(true);
  });

  it('shows the reviewer every lint-clean concept, up to six, with the hook', async () => {
    const six = ['a door', 'a bell', 'a kite', 'a well', 'a drum', 'a sail'].map((symbol) => ({ ...STAMP, symbol }));
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, hook: 'capital buffers', concepts: six } });
    await runImageStep(PARAMS);
    const prompt = editorGenerate.mock.calls[0]![0][0].content as string;
    expect(prompt).toContain('## The hook\ncapital buffers');
    expect(prompt).toContain('6. Symbol: a sail');
    expect(generateImage).toHaveBeenCalledTimes(3);
  });

  it('sends signed style-anchor URLs as references', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, concepts: [STAMP] } });
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
