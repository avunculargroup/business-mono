import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { composePlatformImage, markAspect, markPlacement, platformCrop, toPngMaster } from './imageCompose.js';
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
