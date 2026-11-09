import { describe, it, expect } from 'vitest';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeLayouts, buildImagePrompt, toBrandVisual, DEFAULT_BRAND_MARK } from './imagePrompt.js';
import type { ImageConcept } from './imageBrief.js';

const LIGHTHOUSE: ImageConcept = {
  tension: 'The rules are finally arriving, after years of fog.',
  symbol: 'A lighthouse',
  twist: 'It throws one solid gold beam straight through a bank of fog',
  subject: 'A lighthouse on a rock throwing one solid gold beam through dense fog',
  layout: 'hero_left',
  alt_text: 'A linocut of a lighthouse sending a gold beam through fog.',
};

// Hand-maintained literal rather than a .snap file (the repo's convention — see
// apps/web/app/globals.test.ts). A canon change shows up here as changed lines,
// which is the cue to bump brand_visual.version in the same review. Canon v1.3:
// the v1.2 linocut, now "a flat, straight-on scan of the printed sheet", with
// the photographed-print look prohibited.
const EXPECTED_V1_3_PROMPT = `A bold two-colour linocut print, shown as a flat, straight-on scan of the printed
sheet that fills the whole frame: black ink and one flat gold on bright off-white
paper. Strong, simple shapes cut with confidence: solid black masses, crisp white
gouge lines carved through them, visible carving marks, and the slightly uneven
ink texture of hand printing. Gold is a second printed colour laid down in large
flat shapes, not a thin accent. One iconic subject, big and instantly
recognisable, with a silhouette that still reads at thumbnail size. Graphic,
confident and striking, like a classic travel poster or a woodcut book cover.

Use only these colours:
- Paper #FAFAF8: Bright off-white, unprinted areas clean and even. Not cream, not aged, not yellowed.
- Ink #1A1915: Solid black printed masses and carved line work.
- Gold #C9A84C: A flat second printed colour in large shapes. It may cover up to a third of the image.
No other colour. No gradients or soft shading: tone comes only from carved lines. No glow, no metallic sheen, no drop shadows.

One subject, and make it big: it fills 60 to 80 percent of the frame height.
Simple and bold enough to recognise in half a second on a phone. Place it
according to the layout below, never small and never lost in empty space. Black
and gold together cover roughly a third to two thirds of the image. Print
full-bleed on the paper: no borders, frames, margins, mounts or black bars. Keep
the bottom-right corner (roughly the lowest and rightmost 15 percent of the
frame) as unprinted paper.

Subject: A lighthouse on a rock throwing one solid gold beam through dense fog
The symbol: A lighthouse
The twist: It throws one solid gold beam straight through a bank of fog
Layout: Hero left: The subject is large and sits left of centre, filling most of the frame height; bold open space to the right.
Format: 16:9 landscape.

Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.
Pencil sketch, fine hatching, construction or guide lines, unfinished drawing.
Photographs, 3D, gradients, airbrushing. Any colour other than black and gold.
Borders, frames, letterboxing or bars.
A photograph of a print: no table, desk or background surface, no visible paper
edges or corners, no perspective or tilt, no shadows or lighting on the paper.`;

describe('buildImagePrompt', () => {
  const canon = toBrandVisual(BRAND_VISUAL_ROW);

  it('assembles canon v1.3 + a concept into the exact prompt sent', () => {
    expect(buildImagePrompt(canon, LIGHTHOUSE, { aspectRatio: '16:9' })).toBe(EXPECTED_V1_3_PROMPT);
  });

  it('puts the blocks in order: style, palette, composition, subject, prohibited', () => {
    const p = buildImagePrompt(canon, LIGHTHOUSE, { aspectRatio: '16:9' });
    const at = (s: string) => p.indexOf(s);
    expect(at('A bold two-colour linocut')).toBe(0);
    expect(at('Use only these colours')).toBeGreaterThan(at('A bold two-colour linocut'));
    expect(at('One subject, and make it big')).toBeGreaterThan(at('Use only these colours'));
    expect(at('Subject:')).toBeGreaterThan(at('One subject, and make it big'));
    expect(at('Never include:')).toBeGreaterThan(at('Subject:'));
  });

  it('never sends the tension: it is the reasoning, not the picture', () => {
    expect(buildImagePrompt(canon, LIGHTHOUSE, { aspectRatio: '16:9' })).not.toContain(LIGHTHOUSE.tension);
  });

  it('throws on a layout the canon does not have, or one v1.2 retired (the linter runs first)', () => {
    expect(() => buildImagePrompt(canon, { ...LIGHTHOUSE, layout: 'centred' }, { aspectRatio: '16:9' })).toThrow(/unknown layout/);
  });
});

describe('toBrandVisual', () => {
  it('maps the v1.3 row: three colours, the v1.2 layouts active, v1.1 layouts kept inactive', () => {
    const canon = toBrandVisual(BRAND_VISUAL_ROW);
    expect(canon.version).toBe('1.3');
    expect(canon.palette.map((p) => p.hex)).toEqual(['#FAFAF8', '#1A1915', '#C9A84C']);
    expect(activeLayouts(canon).map((l) => l.key)).toEqual(['hero_left', 'close_crop', 'diagonal', 'against_gold']);
    expect(canon.layouts.filter((l) => !l.is_active).map((l) => l.key)).toEqual(['left_third', 'low_horizon', 'close_detail', 'small_in_space']);
    expect(canon.styleAnchorPaths).toEqual([]);
    expect(canon.motifs).toHaveLength(10);
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
  });

  it('lifts the stock-symbol ban but keeps every finance cliché', () => {
    const canon = toBrandVisual(BRAND_VISUAL_ROW);
    expect(canon.prohibitedTerms).not.toEqual(expect.arrayContaining(['hourglass']));
    expect(canon.prohibitedTerms).not.toContain('clock');
    expect(canon.prohibitedTerms).toEqual(expect.arrayContaining(['coin', 'rocket', 'moon', 'chart', 'candlestick', 'arrow', 'bull', 'bear', '$', '₿']));
  });

  it('drops malformed JSONB entries and defaults a missing brand_mark, rather than throwing', () => {
    const canon = toBrandVisual({
      ...BRAND_VISUAL_ROW,
      layouts: [{ key: 'hero_left', label: 'Hero left', is_active: false }, { nope: true }, 'junk'],
      palette: [{ hex: '#000' }],
      brand_mark: null,
      prohibited_terms: ['coin', '', 7],
    });
    expect(canon.layouts.map((l) => l.key)).toEqual(['hero_left']);
    expect(activeLayouts(canon)).toEqual([]);
    expect(canon.palette).toEqual([]);
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
    expect(canon.prohibitedTerms).toEqual(['coin']);
  });
});
