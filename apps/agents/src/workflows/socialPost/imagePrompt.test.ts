import { describe, it, expect } from 'vitest';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeLayouts, buildImagePrompt, toBrandVisual, DEFAULT_BRAND_MARK } from './imagePrompt.js';
import type { ImageConcept } from './imageBrief.js';

const PIER: ImageConcept = {
  tension: 'Nobody knows what will trigger the reckoning, only that the safe ground is shorter than it looks.',
  subject: 'A timber pier running out over open water',
  drawn: 'the near end of the pier, planks and pilings in full',
  undrawn: 'the far end, where the planks thin into pencil guidelines over the water',
  layout: 'left_third',
  alt_text: 'A pencil sketch of a pier whose far end is only outlined.',
};

// Hand-maintained literal rather than a .snap file (the repo's convention — see
// apps/web/app/globals.test.ts). A canon change shows up here as changed lines,
// which is the cue to bump brand_visual.version in the same review. Canon v1.1:
// the drawn/undrawn device, layouts, bright paper.
const EXPECTED_V1_1_PROMPT = `A hand-drawn sketch in graphite pencil and fine ink on bright, fresh cartridge
paper. Every drawing is deliberately unfinished. The part of the subject that is
known or certain is drawn in full: confident line, light cross-hatching, and the
single gold accent. The part that is uncertain, unbuilt or unknown is left as
faint construction lines only: guidelines, measured marks, an outline that stops
partway. The edge where finished drawing gives way to construction lines is the
point of the picture. It should look like an architect's working sketch, drawn by
a skilled hand to think something through, not to decorate. Considered and
quietly confident, with a clear point of view.

Use only these colours:
- Paper #FAFAF8: Bright near-white paper. Not cream, not aged, not yellowed, not parchment. Clean and even.
- Main linework #1A1915: warm near-black graphite and ink.
- Lighter strokes and hatching #6B6860: warm grey.
- Accent #C9A84C: a single light wash or stroke of muted gold on ONE element only.
No other colour. No gradients, no glow, no metallic sheen, no drop shadows.

Follow the layout given below exactly. Never centre a single upright object in a
wide frame. Prefer subjects with a horizontal extent that suit a landscape frame.
Keep every important element inside the central 80% of the frame. Leave the
bottom-right corner (roughly the lowest and rightmost 15% of the frame) as empty
paper.

Subject: A timber pier running out over open water
Draw in full: the near end of the pier, planks and pilings in full
Leave as construction lines only: the far end, where the planks thin into pencil guidelines over the water
Layout: Left third: Subject sits in the left third; open paper runs to the right, so the eye travels into space.
Format: 16:9 landscape.

Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.`;

describe('buildImagePrompt', () => {
  const canon = toBrandVisual(BRAND_VISUAL_ROW);

  it('assembles canon v1.1 + a concept into the exact prompt sent', () => {
    expect(buildImagePrompt(canon, PIER, { aspectRatio: '16:9' })).toBe(EXPECTED_V1_1_PROMPT);
  });

  it('puts the blocks in order: style, palette, composition, subject, prohibited', () => {
    const p = buildImagePrompt(canon, PIER, { aspectRatio: '16:9' });
    const at = (s: string) => p.indexOf(s);
    expect(at('A hand-drawn sketch')).toBe(0);
    expect(at('Use only these colours')).toBeGreaterThan(at('A hand-drawn sketch'));
    expect(at('Follow the layout given below')).toBeGreaterThan(at('Use only these colours'));
    expect(at('Subject:')).toBeGreaterThan(at('Follow the layout given below'));
    expect(at('Never include:')).toBeGreaterThan(at('Subject:'));
  });

  it('never sends the tension: it is the reasoning, not the picture', () => {
    expect(buildImagePrompt(canon, PIER, { aspectRatio: '16:9' })).not.toContain(PIER.tension);
  });

  it('throws on a layout the canon does not have (the linter runs first)', () => {
    expect(() => buildImagePrompt(canon, { ...PIER, layout: 'centred' }, { aspectRatio: '16:9' })).toThrow(/unknown layout/);
  });
});

describe('toBrandVisual', () => {
  it('maps the v1.1 row, keeping the retired motifs for old images', () => {
    const canon = toBrandVisual(BRAND_VISUAL_ROW);
    expect(canon.version).toBe('1.1');
    expect(activeLayouts(canon).map((l) => l.key)).toEqual(['left_third', 'low_horizon', 'close_detail', 'small_in_space']);
    expect(canon.motifs).toHaveLength(10);
    expect(canon.palette.map((p) => p.hex)).toEqual(['#FAFAF8', '#1A1915', '#6B6860', '#C9A84C']);
    expect(canon.prohibitedTerms).toEqual(expect.arrayContaining(['hourglass', 'clock', 'calendar', 'vault door', 'coin']));
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
  });

  it('drops malformed JSONB entries and defaults a missing brand_mark, rather than throwing', () => {
    const canon = toBrandVisual({
      ...BRAND_VISUAL_ROW,
      layouts: [{ key: 'left_third', label: 'Left third', is_active: false }, { nope: true }, 'junk'],
      palette: [{ hex: '#000' }],
      brand_mark: null,
      prohibited_terms: ['coin', '', 7],
    });
    expect(canon.layouts.map((l) => l.key)).toEqual(['left_third']);
    expect(activeLayouts(canon)).toEqual([]);
    expect(canon.palette).toEqual([]);
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
    expect(canon.prohibitedTerms).toEqual(['coin']);
  });

  it('reads a row from before v1.1 as having no layouts', () => {
    const { layouts: _dropped, ...v1 } = BRAND_VISUAL_ROW;
    expect(toBrandVisual(v1).layouts).toEqual([]);
  });
});
