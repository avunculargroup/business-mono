import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { DEFAULT_CARD_SETTINGS } from '@platform/shared';
import {
  CARD_INK_HEX,
  CARD_KICKER_HEX,
  cardLayout,
  composeHeadlineCard,
  composeSquareImageOnly,
  fitCardHeadline,
  fitHeadline,
  headlineCardSvg,
  HeadlineDoesNotFit,
  loadCardFonts,
  wrapHeadline,
} from './headlineCard.js';
import { markPlacement, platformCrop } from './imageCompose.js';
import { DEFAULT_BRAND_MARK } from './imagePrompt.js';

/** A fake measurer: every character is 10px at size 10, scaling with size. */
const measure10 = (s: string) => s.length * 10;

describe('wrapHeadline', () => {
  it('wraps greedily and never splits a word', () => {
    expect(wrapHeadline('Discipline beats conviction.', measure10, 150, 4)).toEqual(['Discipline', 'beats', 'conviction.']);
    expect(wrapHeadline('Who moved the measuring stick?', measure10, 200, 4)).toEqual(['Who moved the', 'measuring stick?']);
  });

  it('returns null when one word is wider than the line', () => {
    expect(wrapHeadline('Seaworthiness matters.', measure10, 100, 4)).toBeNull();
  });

  it('returns null past the line limit', () => {
    expect(wrapHeadline('one two three four five', measure10, 50, 4)).toBeNull();
    expect(wrapHeadline('one two three four', measure10, 50, 4)).toEqual(['one', 'two', 'three', 'four']);
  });
});

describe('fitHeadline', () => {
  const sizes = [64, 60, 56, 52, 48, 44];
  /** Half the size per character. */
  const half = (s: string, size: number) => (s.length * size) / 2;

  it('fits at the largest size when it can', () => {
    expect(fitHeadline('Rates held.', half, sizes, 481, 4)).toEqual({ size: 64, lines: ['Rates held.'] });
  });

  it('steps down until it fits', () => {
    // "Seaworthiness." is 14 characters: 7px per point of size, so 336 at 48 fits a 340 line and 364 at 52 does not.
    expect(fitHeadline('Seaworthiness.', half, sizes, 340, 4)).toEqual({ size: 48, lines: ['Seaworthiness.'] });
  });

  it('returns null when nothing fits at 44 in four lines', () => {
    expect(fitHeadline('Incomprehensibilities.', half, sizes, 340, 4)).toBeNull();
    expect(fitHeadline('one two three four five', half, sizes, 100, 4)).toBeNull();
  });
});

describe('cardLayout', () => {
  it('lays out the LinkedIn card', () => {
    expect(cardLayout('linkedin')).toEqual({
      width: 1200,
      height: 627,
      art: { left: 573, top: 0, size: 627 },
      text: { left: 56, width: 481 },
      kicker: { size: 20, tracking: 0.08, gap: 16 },
      headline: { sizes: [64, 60, 56, 52, 48, 44], lineHeight: 1.1, maxLines: 4 },
    });
  });

  it('scales the X card by 900 / 627', () => {
    const x = cardLayout('twitter_x');
    expect(x.art).toEqual({ left: 700, top: 0, size: 900 });
    expect(x.text).toEqual({ left: 80, width: 700 - 80 - 52 });
    expect(x.kicker).toEqual({ size: 29, tracking: 0.08, gap: 23 });
    expect(x.headline.sizes[0]).toBe(92);
    expect(x.headline.sizes.at(-1)).toBe(63);
  });

  it('takes sizes and lines from the canon’s card settings', () => {
    const l = cardLayout('linkedin', { ...DEFAULT_CARD_SETTINGS, headline_size_max: 56, headline_size_min: 46, max_lines: 3 });
    expect(l.headline).toEqual({ sizes: [56, 52, 48, 46], lineHeight: 1.1, maxLines: 3 });
  });
});

describe('headline card composition (bundled fonts)', () => {
  const fonts = loadCardFonts();
  const art = () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: { r: 0x1a, g: 0x19, b: 0x15 } } }).png().toBuffer();

  it('emits the text as paths, never as <text> or a font name', () => {
    const svg = headlineCardSvg({ kicker: 'REGULATION', headline: "Direction isn't seaworthiness." }, cardLayout('linkedin'), fonts);
    expect(svg).not.toMatch(/<text|font-family|@font-face/);
    expect(svg.match(/<path /g)).toHaveLength(2);
    expect(svg).toContain(`fill="${CARD_INK_HEX}"`);
  });

  it('draws no kicker path when there is no kicker', () => {
    const svg = headlineCardSvg({ kicker: null, headline: 'Discipline beats conviction.' }, cardLayout('linkedin'), fonts);
    expect(svg.match(/<path /g)).toHaveLength(1);
  });

  it('prints the brief\'s sentence-case kicker in capitals', () => {
    const layout = cardLayout('linkedin');
    const headline = 'Almost eighteen years. No forgery.';
    const kickerPath = (kicker: string) => headlineCardSvg({ kicker, headline }, layout, fonts).match(/<path [^>]*>/)![0];
    expect(kickerPath('Bitcoin security')).toBe(kickerPath('BITCOIN SECURITY'));
    expect(kickerPath('Bitcoin security')).toContain(`fill="${CARD_KICKER_HEX}"`);
  });

  it('re-centres the text block when there is no kicker', () => {
    const layout = cardLayout('linkedin');
    const headline = 'Discipline beats conviction.';
    const firstY = (svg: string) => Number(/fill="#[0-9A-Fa-f]{6}" d="M[\d.-]+ ([\d.-]+)/.exec(svg.match(/<path [^>]*>/g)!.at(-1)!)![1]);
    const withKicker = firstY(headlineCardSvg({ kicker: 'Bitcoin security', headline }, layout, fonts));
    const alone = firstY(headlineCardSvg({ kicker: null, headline }, layout, fonts));
    // The kicker's line and gap are shared above and below: the headline sits half of it higher alone.
    const kickerHeight = layout.kicker.size * 1.2 + layout.kicker.gap;
    expect(withKicker - alone).toBeCloseTo(kickerHeight / 2, 1);
  });

  it('fits a real headline and refuses one that cannot fit', () => {
    expect(fitCardHeadline('Discipline beats conviction.', cardLayout('linkedin'), fonts)?.size).toBe(64);
    const long = 'Incomprehensibilities overwhelmingly characterise counterrevolutionaries.';
    expect(fitCardHeadline(long, cardLayout('linkedin'), fonts)).toBeNull();
    expect(() => headlineCardSvg({ kicker: null, headline: long }, cardLayout('linkedin'), fonts)).toThrow(HeadlineDoesNotFit);
  });

  for (const platform of ['linkedin', 'twitter_x'] as const) {
    it(`composes the ${platform} card at its size with the art flush right and the mark placed`, async () => {
      const crop = platformCrop(platform);
      const out = await composeHeadlineCard(await art(), { kicker: 'MACRO', headline: 'Confidence just hit −15.' }, crop, DEFAULT_BRAND_MARK, { fonts });
      const meta = await sharp(out).metadata();
      expect([meta.width, meta.height]).toEqual([crop.width, crop.height]);

      const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
      const at = (x: number, y: number) => data[(y * info.width + x) * info.channels]!;
      // Top-left is paper; the art panel (dark here) starts at width - height.
      expect(at(2, 2)).toBeGreaterThan(240);
      expect(at(crop.width - crop.height + 5, 5)).toBeLessThan(40);
      // The mark is composited where markPlacement says: its centre is not the dark art.
      const m = markPlacement(crop.width, crop.height, DEFAULT_BRAND_MARK, 1);
      expect(at(m.left + Math.round(m.width / 2), m.top + Math.round(m.height / 2))).not.toBe(at(crop.width - crop.height + 5, 5));
    });
  }

  it('centres square art on paper for the image-only fallback', async () => {
    const crop = platformCrop('linkedin');
    const out = await composeSquareImageOnly(await art(), crop, { ...DEFAULT_BRAND_MARK, enabled: false });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1200, 627]);
    const at = (x: number) => data[(10 * info.width + x) * info.channels]!;
    expect(at(5)).toBeGreaterThan(240);
    expect(at(600)).toBeLessThan(40);
    expect(at(1195)).toBeGreaterThan(240);
  });
});
