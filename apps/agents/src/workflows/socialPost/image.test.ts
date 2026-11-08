import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import { createFakeSupabase, type FakeSupabaseClient } from '../../../test/mocks/supabase.js';
import { BRAND_VISUAL_V1_ROW } from '../../../test/fixtures/brandVisual.js';

// runImageStep with its edges mocked: the agents, the model resolver and the
// OpenRouter call. Crop + mark runs for real through sharp, so the uploaded bytes
// are genuine PNGs at the platform sizes.
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

const BRIEF = {
  skip: false,
  skip_reason: null,
  motif_key: 'balance',
  subject: 'A two-pan balance scale resting level on a desk',
  metaphor: 'policy is a weighed decision',
  composition: null,
  alt_text: 'A pencil sketch of a level balance scale on a desk.',
};

const PARAMS = {
  accountIds: ['acc-li', 'acc-x'],
  story: { id: 'news-0', title: 'RBA holds', summary: 'Rates unchanged.', key_points: ['held at 4.35%'] },
  form: 'teach',
  postCopy: 'The RBA held rates at 4.35%.',
  posts: [
    { contentItemId: 'ci-li', platform: 'linkedin' as const },
    { contentItemId: 'ci-x', platform: 'twitter_x' as const },
  ],
  imageSpecs: new Map(),
};

let master: Buffer;

beforeEach(async () => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  process.env['OPENROUTER_API_KEY'] = 'test-key';
  master ??= await sharp({ create: { width: 1344, height: 768, channels: 3, background: '#FAFAF8' } }).png().toBuffer();

  fakeSupabase.__setResponse('brand_visual', { data: BRAND_VISUAL_V1_ROW, error: null });
  fakeSupabase.__setResponse('content_images', { data: [], error: null });
  charlieGenerate.mockResolvedValue({ object: BRIEF });
  lexGenerate.mockResolvedValue({
    object: { classification: 'educational', needs_disclaimer: false, disclaimer_key: null, rationale: 'describes' },
  });
  generateImage.mockResolvedValue({ image: master, mediaType: 'image/png', costUsd: 0.039, generationRef: 'gen-1', referencesDropped: false });
  bucket.upload.mockResolvedValue({ data: {}, error: null });
  bucket.remove.mockResolvedValue({ data: [], error: null });
  bucket.createSignedUrl.mockImplementation(async (path: string) => ({ data: { signedUrl: `https://signed.example/${path}` }, error: null }));
});

afterEach(() => {
  delete process.env['OPENROUTER_API_KEY'];
});

function insertedImageRows(): Array<Record<string, unknown>> {
  const b = fakeSupabase.__buildersFor('content_images').find((x) => x.insert.mock.calls.length > 0);
  return (b?.insert.mock.calls[0]?.[0] ?? []) as Array<Record<string, unknown>>;
}

function activityActions(): string[] {
  return fakeSupabase
    .__buildersFor('agent_activity')
    .flatMap((b) => b.insert.mock.calls.flatMap((c) => (c[0] as Array<{ action: string }>).map((r) => r.action)));
}

describe('runImageStep', () => {
  it('renders once, uploads master + both marked crops, and inserts one row per post sharing a group', async () => {
    const { outcome, images } = await runImageStep(PARAMS);

    expect(outcome).toMatchObject({ status: 'generated', motif_key: 'balance', cost_usd: 0.039 });
    expect(generateImage).toHaveBeenCalledTimes(1);
    const req = generateImage.mock.calls[0]![0];
    expect(req).toMatchObject({ model: 'google/gemini-2.5-flash-image', aspectRatio: '16:9', referenceUrls: [] });
    expect(req.prompt).toContain('Visual metaphor: Balance — policy is a weighed decision');

    const paths = bucket.upload.mock.calls.map((c) => c[0] as string);
    expect(paths).toHaveLength(3);
    expect(paths[0]).toMatch(new RegExp(`^social-images/\\d{4}-\\d{2}-\\d{2}/${outcome.generation_group_id}/master-16x9\\.png$`));
    expect(paths.slice(1).map((p) => p.split('/').pop())).toEqual(['linkedin-1200x627.png', 'x-1600x900.png']);
    const liBytes = bucket.upload.mock.calls[1]![1] as Buffer;
    expect(await sharp(liBytes).metadata()).toMatchObject({ width: 1200, height: 627 });

    const rows = insertedImageRows();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r['generation_group_id']))).toEqual(new Set([outcome.generation_group_id]));
    expect(rows[0]).toMatchObject({
      content_item_id: 'ci-li',
      platform_crop: 'linkedin_1200x627',
      source: 'ai_generated',
      brand_visual_version: '1.0',
      model_id: 'google/gemini-2.5-flash-image',
      generation_ref: 'gen-1',
      cost_usd: 0.039,
      alt_text: BRIEF.alt_text,
      image_brief: BRIEF,
      thread_segment_id: null,
    });
    expect(rows[0]!['storage_path']).toMatch(/linkedin-1200x627\.png$/);
    expect(rows[0]!['assembled_prompt']).toBe(req.prompt);
    expect((rows[0]!['alt_text_verdict'] as { classification: string }).classification).toBe('educational');

    expect(activityActions()).toEqual(['social_image_generated', 'compliance_checked']);
    expect(images.get('ci-x')).toEqual({ url: expect.stringMatching(/x-1600x900\.png$/), altText: BRIEF.alt_text });
  });

  it('is disabled when there is no active canon', async () => {
    fakeSupabase.__setResponse('brand_visual', { data: null, error: null });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('disabled');
    expect(charlieGenerate).not.toHaveBeenCalled();
  });

  it('feeds recent motifs into the brief prompt', async () => {
    fakeSupabase.__setResponse('content_images', {
      data: [
        { generation_group_id: 'g1', image_brief: { motif_key: 'vault' } },
        { generation_group_id: 'g1', image_brief: { motif_key: 'vault' } },
        { generation_group_id: 'g2', image_brief: { motif_key: 'ledger' } },
      ],
      error: null,
    });
    await runImageStep(PARAMS);
    const prompt = charlieGenerate.mock.calls[0]![0][0].content as string;
    expect(prompt).toContain('## Recently used motifs\nvault, ledger.');
    expect(prompt).toContain('The RBA held rates at 4.35%.');
  });

  it('skips cleanly when the brief chooses not to illustrate', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, skip: true, skip_reason: 'No honest visual.' } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome).toEqual({ status: 'skipped', reason: 'No honest visual.' });
    expect(generateImage).not.toHaveBeenCalled();
    expect(activityActions()).toEqual(['social_image_skipped']);
  });

  it('re-briefs once on a lint hit, then renders the clean brief', async () => {
    charlieGenerate
      .mockResolvedValueOnce({ object: { ...BRIEF, subject: 'A rocket over a ledger' } })
      .mockResolvedValueOnce({ object: BRIEF });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    expect(charlieGenerate).toHaveBeenCalledTimes(2);
    expect(charlieGenerate.mock.calls[1]![0][0].content).toContain('subject names prohibited imagery: rocket');
  });

  it('skips after a second lint failure, never looping', async () => {
    charlieGenerate.mockResolvedValue({ object: { ...BRIEF, motif_key: 'rocketship' } });
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

  it('fails without writing anything when the render fails', async () => {
    generateImage.mockRejectedValue(new Error('Image render timed out after 120s.'));
    const { outcome, images } = await runImageStep(PARAMS);
    expect(outcome).toMatchObject({ status: 'failed', motif_key: 'balance', reason: 'Image render timed out after 120s.' });
    expect(bucket.upload).not.toHaveBeenCalled();
    expect(insertedImageRows()).toEqual([]);
    expect(images.size).toBe(0);
  });

  it('fails when OPENROUTER_API_KEY is missing', async () => {
    delete process.env['OPENROUTER_API_KEY'];
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('failed');
    expect(outcome.reason).toMatch(/OPENROUTER_API_KEY/);
  });

  it('removes uploaded objects and inserts no rows when an upload fails part-way', async () => {
    bucket.upload
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'quota' } });
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('failed');
    expect(insertedImageRows()).toEqual([]);
    expect(bucket.remove).toHaveBeenCalledWith([expect.stringMatching(/master-16x9\.png$/)]);
  });

  it('persists with a fail-safe verdict when the alt-text Lex check errors', async () => {
    lexGenerate.mockRejectedValue(new Error('lex down'));
    const { outcome } = await runImageStep(PARAMS);
    expect(outcome.status).toBe('generated');
    const verdict = insertedImageRows()[0]!['alt_text_verdict'] as { classification: string; rationale: string };
    expect(verdict.classification).toBe('general_advice');
    expect(verdict.rationale).toMatch(/unavailable/);
  });

  it('sends signed style-anchor URLs as references', async () => {
    fakeSupabase.__setResponse('brand_visual', {
      data: { ...BRAND_VISUAL_V1_ROW, style_anchor_paths: ['social-images/anchors/a.png', 'social-images/anchors/b.png'] },
      error: null,
    });
    await runImageStep(PARAMS);
    expect(generateImage.mock.calls[0]![0].referenceUrls).toEqual([
      'https://signed.example/social-images/anchors/a.png',
      'https://signed.example/social-images/anchors/b.png',
    ]);
  });
});
