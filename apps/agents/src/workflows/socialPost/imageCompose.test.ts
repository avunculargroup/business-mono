import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  BAR_MAX_SHARE,
  GAIN_MAX,
  GAIN_MIN,
  MAX_INK_COVERAGE,
  MIN_INK_COVERAGE,
  detectBars,
  inkCoverage,
  legibility,
  stripBars,
  composePlatformImage,
  correctPaper,
  markAspect,
  markPlacement,
  paperGains,
  platformCrop,
  samplePaper,
  toPngMaster,
} from './imageCompose.js';
import { DEFAULT_BRAND_MARK } from './imagePrompt.js';

const PAPER = { r: 0xfa, g: 0xfa, b: 0xf8 };

async function paperMaster(width = 1920, height = 1080): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: PAPER } }).png().toBuffer();
}

async function pixel(img: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(img).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i]!, data[i + 1]!, data[i + 2]!];
}

describe('markPlacement', () => {
  // The spec's table: 9% height, 4% margin, both from crop height.
  it('sizes the mark at 81px with a 36px margin on the X crop', () => {
    expect(markPlacement(1600, 900, DEFAULT_BRAND_MARK)).toEqual({ width: 81, height: 81, left: 1600 - 36 - 81, top: 900 - 36 - 81 });
  });

  it('sizes the mark at 56px with a 25px margin on the LinkedIn crop', () => {
    expect(markPlacement(1200, 627, DEFAULT_BRAND_MARK)).toEqual({ width: 56, height: 56, left: 1200 - 25 - 56, top: 627 - 25 - 56 });
  });

  it('honours a non-square aspect and edited percentages', () => {
    expect(markPlacement(1000, 500, { ...DEFAULT_BRAND_MARK, height_pct: 10, margin_pct: 2 }, 2)).toEqual({
      width: 100,
      height: 50,
      left: 890,
      top: 440,
    });
  });

  it('reads the BTS mark as square from its viewBox', () => {
    expect(markAspect()).toBe(1);
  });
});

describe('platformCrop', () => {
  it('falls back to the seeded sizes', () => {
    expect(platformCrop('twitter_x')).toMatchObject({ width: 1600, height: 900, cropKey: 'x_1600x900', fileName: 'x-1600x900.png' });
    expect(platformCrop('linkedin', null)).toMatchObject({ width: 1200, height: 627, cropKey: 'linkedin_1200x627' });
  });

  it('reads post.recommended from platform_specs.image_specs', () => {
    expect(platformCrop('linkedin', { post: { ratio: '1.91:1', recommended: '1200x627' } }).cropKey).toBe('linkedin_1200x627');
    expect(platformCrop('twitter_x', { post: { recommended: '1200 x 675' } })).toMatchObject({ width: 1200, height: 675 });
    expect(platformCrop('twitter_x', { post: { recommended: 'big' } })).toMatchObject({ width: 1600, height: 900 });
  });
});

describe('composePlatformImage', () => {
  it('crops to the platform size and puts the mark bottom-right, leaving the rest as paper', async () => {
    const master = await toPngMaster(await paperMaster());
    const crop = platformCrop('linkedin');
    const out = await composePlatformImage(master, crop, DEFAULT_BRAND_MARK);

    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1200, 627, 'png']);

    const p = markPlacement(1200, 627, DEFAULT_BRAND_MARK);
    const centre = await pixel(out, p.left + Math.round(p.width / 2), p.top + Math.round(p.height / 2) - 10);
    expect(centre).not.toEqual([PAPER.r, PAPER.g, PAPER.b]);
    expect(await pixel(out, 10, 10)).toEqual([PAPER.r, PAPER.g, PAPER.b]);
    expect(await pixel(out, 1199, 626)).toEqual([PAPER.r, PAPER.g, PAPER.b]); // inside the margin
  });

  it('leaves the crop unmarked when the mark is disabled', async () => {
    const out = await composePlatformImage(await paperMaster(), platformCrop('twitter_x'), { ...DEFAULT_BRAND_MARK, enabled: false });
    const p = markPlacement(1600, 900, DEFAULT_BRAND_MARK);
    expect(await pixel(out, p.left + 40, p.top + 30)).toEqual([PAPER.r, PAPER.g, PAPER.b]);
  });

  it('normalises a JPEG master to PNG', async () => {
    const jpeg = await sharp({ create: { width: 64, height: 36, channels: 3, background: PAPER } }).jpeg().toBuffer();
    expect((await sharp(await toPngMaster(jpeg)).metadata()).format).toBe('png');
  });
});

describe('paperGains', () => {
  it('pulls yellowed paper back toward the palette paper, within the clamp', () => {
    // The parchment the v1.0 hourglass came back on.
    const c = paperGains([236, 226, 200], '#FAFAF8');
    expect(c.applied).toBe(true);
    for (const g of c.gains) {
      expect(g).toBeGreaterThanOrEqual(GAIN_MIN);
      expect(g).toBeLessThanOrEqual(GAIN_MAX);
    }
    expect(c.gains[0]).toBeCloseTo(250 / 236, 3);
    expect(c.gains[1]).toBeCloseTo(250 / 226, 3);
    // Blue would need 1.24 to reach #F8; it stops at the clamp, and says so.
    expect(c.gains[2]).toBe(GAIN_MAX);
    expect(c.reason).toMatch(/clamp/);
  });

  it('skips a corner that holds drawing rather than paper', () => {
    const c = paperGains([60, 58, 52], '#FAFAF8');
    expect(c).toMatchObject({ applied: false, gains: [1, 1, 1] });
    expect(c.reason).toMatch(/not empty paper/);
  });

  it('leaves paper that is already right at about 1', () => {
    const c = paperGains([250, 250, 248], '#FAFAF8');
    expect(c.applied).toBe(true);
    for (const g of c.gains) expect(g).toBeCloseTo(1, 3);
  });

  it('never darkens bright paper past the lower clamp, and falls back to #FAFAF8 on a bad hex', () => {
    expect(paperGains([255, 255, 255], '#C0C0C0').gains).toEqual([GAIN_MIN, GAIN_MIN, GAIN_MIN]);
    expect(paperGains([236, 226, 200], 'not-a-hex').gains).toEqual(paperGains([236, 226, 200], '#FAFAF8').gains);
  });
});

describe('correctPaper', () => {
  it('samples the empty bottom-right corner and corrects the whole master', async () => {
    const parchment = await sharp({ create: { width: 400, height: 225, channels: 3, background: { r: 236, g: 226, b: 200 } } })
      .png()
      .toBuffer();
    expect(await samplePaper(parchment)).toEqual([236, 226, 200]);

    const { image, correction } = await correctPaper(parchment, '#FAFAF8');
    expect(correction.applied).toBe(true);
    const [r, g, b] = await pixel(image, 10, 10);
    expect(r).toBeGreaterThanOrEqual(249);
    expect(g).toBeGreaterThanOrEqual(249);
    expect(b).toBeGreaterThan(200); // moved toward #F8, held by the clamp
  });

  it('leaves the master untouched when the corner is not paper', async () => {
    const dark = await sharp({ create: { width: 100, height: 100, channels: 3, background: { r: 40, g: 40, b: 40 } } }).png().toBuffer();
    const { image, correction } = await correctPaper(dark, '#FAFAF8');
    expect(correction.applied).toBe(false);
    expect(image).toBe(dark);
  });

  it('handles a render with an alpha channel', async () => {
    const rgba = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 236, g: 226, b: 200, alpha: 1 } } })
      .png()
      .toBuffer();
    const { correction } = await correctPaper(rgba, '#FAFAF8');
    expect(correction.sample).toEqual([236, 226, 200]);
    expect(correction.applied).toBe(true);
  });
});

// ── Letterbox bars ───────────────────────────────────────────────────────────

const paperLine = { mean: 0.95, std: 0.01 };
const barLine = { mean: 0.03, std: 0.005 };
const lines = (top: number, middle: number, bottom: number, mid = paperLine) => [
  ...Array(top).fill(barLine),
  ...Array(middle).fill(mid),
  ...Array(bottom).fill(barLine),
];

describe('detectBars', () => {
  it('finds top and bottom letterbox bars', () => {
    expect(detectBars(lines(6, 86, 8), lines(0, 160, 0))).toEqual({
      top: 6,
      bottom: 8,
      left: 0,
      right: 0,
      reject: false,
      reason: 'letterbox bars stripped',
    });
  });

  it('leaves a frame with no bars untouched', () => {
    expect(detectBars(lines(0, 90, 0), lines(0, 160, 0))).toMatchObject({ top: 0, bottom: 0, left: 0, right: 0, reject: false, reason: 'no bars' });
  });

  it('rejects bars over 20% of the frame: that is not letterboxing', () => {
    const d = detectBars(lines(15, 70, 15), lines(0, 160, 0));
    expect(d.reject).toBe(true);
    expect((15 + 15) / 100).toBeGreaterThan(BAR_MAX_SHARE);
    expect(d.reason).toMatch(/30% of the frame/);
  });

  it('does not take a dark subject touching an edge for a bar', () => {
    // A black mass along the top edge with carved white lines through it:
    // dark on average, but far from uniform.
    const subjectEdge = { mean: 0.1, std: 0.3 };
    expect(detectBars([subjectEdge, subjectEdge, ...lines(0, 80, 0)], lines(0, 160, 0))).toMatchObject({ top: 0, reject: false });
  });

  it('rejects an all-black frame', () => {
    expect(detectBars(lines(50, 0, 0), lines(80, 0, 0)).reject).toBe(true);
  });
});

/** A cream render with a dark subject, letterboxed top and bottom: the v1.1 fence-post case. */
async function letterboxedCream(): Promise<Buffer> {
  const width = 1344;
  const height = 768;
  const bar = 72;
  const subject = await sharp({ create: { width: 500, height: 400, channels: 3, background: { r: 26, g: 25, b: 21 } } }).png().toBuffer();
  const black = await sharp({ create: { width, height: bar, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: { r: 236, g: 226, b: 200 } } })
    .composite([
      { input: black, left: 0, top: 0 },
      { input: black, left: 0, top: height - bar },
      { input: subject, left: 150, top: 184 },
    ])
    .png()
    .toBuffer();
}

describe('stripBars', () => {
  it('fixes the letterbox-and-cream case: bars stripped, then the paper correction applies', async () => {
    const render = await letterboxedCream();

    // The bug: sampled with the bars in, the corner is black and the correction skips.
    const before = await correctPaper(render, '#FAFAF8');
    expect(before.correction.applied).toBe(false);
    expect(before.correction.reason).toMatch(/not empty paper/);

    const { image, bars } = await stripBars(render);
    expect(bars).toMatchObject({ top: 72, bottom: 72, left: 0, right: 0, reject: false });
    expect(await sharp(image).metadata()).toMatchObject({ width: 1344, height: 624 });

    const after = await correctPaper(image, '#FAFAF8');
    expect(after.correction).toMatchObject({ sample: [236, 226, 200], applied: true });
    expect((await pixel(after.image, 20, 20))[0]).toBeGreaterThanOrEqual(249);
  });

  it('returns a clean render untouched', async () => {
    const clean = await paperMaster(400, 225);
    const { image, bars } = await stripBars(clean);
    expect(image).toBe(clean);
    expect(bars.reason).toBe('no bars');
  });
});

// ── Legibility gate ──────────────────────────────────────────────────────────

/** A 256-bin histogram with `ink` of the pixels at luma 40 and the rest at 250. */
function histogram(ink: number, total = 10000): number[] {
  const h = new Array<number>(256).fill(0);
  h[40] = Math.round(total * ink);
  h[250] = total - h[40]!;
  return h;
}

describe('inkCoverage', () => {
  it('fails a faint sketch: too little ink to register at phone size', () => {
    const c = inkCoverage(histogram(0.06));
    expect(c).toMatchObject({ coverage: 0.06, pass: false });
    expect(c.reason).toMatch(/too faint/);
  });

  it('passes a bold print', () => {
    expect(inkCoverage(histogram(0.45))).toMatchObject({ coverage: 0.45, pass: true });
  });

  it('fails a near-solid black mass', () => {
    const c = inkCoverage(histogram(0.9));
    expect(c.pass).toBe(false);
    expect(c.reason).toMatch(/solid mass/);
  });

  it('counts gold as ink and the band edges as passing', () => {
    const h = new Array<number>(256).fill(0);
    h[168] = 3000; // #C9A84C is about 0.66 luma
    h[250] = 7000;
    expect(inkCoverage(h)).toMatchObject({ coverage: 0.3, pass: true });
    expect(inkCoverage(histogram(MIN_INK_COVERAGE)).pass).toBe(true);
    expect(inkCoverage(histogram(MAX_INK_COVERAGE)).pass).toBe(true);
  });

  it('fails an empty histogram', () => {
    expect(inkCoverage(new Array(256).fill(0))).toMatchObject({ coverage: 0, pass: false });
  });
});

describe('legibility', () => {
  it('measures a real bold print and a real faint one', async () => {
    const block = await sharp({ create: { width: 700, height: 500, channels: 3, background: { r: 26, g: 25, b: 21 } } }).png().toBuffer();
    const bold = await sharp({ create: { width: 1344, height: 768, channels: 3, background: PAPER } })
      .composite([{ input: block, left: 100, top: 130 }])
      .png()
      .toBuffer();
    const bolder = await legibility(bold);
    expect(bolder.pass).toBe(true);
    expect(bolder.coverage).toBeGreaterThan(0.3);

    expect((await legibility(await paperMaster())).pass).toBe(false);
  });
});
