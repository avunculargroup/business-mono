import { describe, it, expect } from 'vitest';
import { BRAND_VISUAL_V1_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeMotifs, buildImagePrompt, toBrandVisual, DEFAULT_BRAND_MARK } from './imagePrompt.js';
import type { ImageBrief } from './imageBrief.js';

const BRIEF: ImageBrief = {
  skip: false,
  skip_reason: null,
  motif_key: 'vault',
  subject: 'A strongbox standing open on a plain desk',
  metaphor: 'custody is a habit, not a moment',
  composition: 'Strongbox left of centre, open paper to the right',
  alt_text: 'A pencil sketch of an open strongbox on a desk.',
};

// Hand-maintained literal rather than a .snap file (the repo's convention — see
// apps/web/app/globals.test.ts). A canon change shows up here as a changed line,
// which is the cue to bump brand_visual.version in the same review.
const EXPECTED_V1_PROMPT = `A hand-drawn sketch in graphite pencil and fine ink on warm off-white paper.
Loose, confident linework from a skilled hand: some lines drawn twice, light
construction lines left visible, light cross-hatching for shade. It should look
like a page from an architect's or engineer's sketchbook, drawn to think
something through. One focal idea with generous empty paper; the subject fills
no more than about 60% of the frame. Calm, considered and quietly confident.
Warm in tone, never cool.

Use only these colours:
- Paper #FAFAF8: warm off-white. Clean and even, no visible paper grain, stains or vignette.
- Main linework #1A1915: warm near-black graphite and ink.
- Lighter strokes and hatching #6B6860: warm grey.
- Accent #C9A84C: a single light wash or stroke of muted gold on ONE element only.
No other colour. No gradients, no glow, no metallic sheen, no drop shadows.

Front-on or gentle three-quarter view; no dramatic perspective. Asymmetric
balance with clear empty paper on at least one side. Keep every important
element inside the central 80% of the frame, so the image survives platform
crops. Leave the bottom-right corner (roughly the lowest and rightmost 15% of
the frame) as empty paper.

Subject: A strongbox standing open on a plain desk
Visual metaphor: Vault — custody is a habit, not a moment
Composition note: Strongbox left of centre, open paper to the right
Format: 16:9 landscape.

Never include: text, letters, numbers, labels, logos, watermarks or signatures.
Coins of any kind, currency symbols, gold bars, piles of money, rockets, moons,
bulls or bears, price charts, candlesticks, arrows pointing up or down, trading
screens. People's faces, hands holding phones, office stock-photo scenes. Neon,
dark backgrounds, colour beyond the palette, 3D renders, photorealism, digital
vector polish, cartoon, comic, caricature or childlike doodle styles, mascots,
paper texture or film grain.`;

describe('buildImagePrompt', () => {
  const canon = toBrandVisual(BRAND_VISUAL_V1_ROW);

  it('assembles canon v1.0 + a brief into the exact prompt sent', () => {
    expect(buildImagePrompt(canon, BRIEF, { aspectRatio: '16:9' })).toBe(EXPECTED_V1_PROMPT);
  });

  it('puts the blocks in order: style, palette, composition, subject, prohibited', () => {
    const p = buildImagePrompt(canon, BRIEF, { aspectRatio: '16:9' });
    const at = (s: string) => p.indexOf(s);
    expect(at('A hand-drawn sketch')).toBe(0);
    expect(at('Use only these colours')).toBeGreaterThan(at('A hand-drawn sketch'));
    expect(at('Front-on or gentle')).toBeGreaterThan(at('Use only these colours'));
    expect(at('Subject:')).toBeGreaterThan(at('Front-on or gentle'));
    expect(at('Never include:')).toBeGreaterThan(at('Subject:'));
  });

  it('omits the composition note when the brief has none, and is deterministic', () => {
    const brief = { ...BRIEF, composition: null };
    const a = buildImagePrompt(canon, brief, { aspectRatio: '16:9' });
    expect(a).not.toContain('Composition note:');
    expect(buildImagePrompt(canon, brief, { aspectRatio: '16:9' })).toBe(a);
  });

  it('throws on a motif the canon does not have (the linter runs first)', () => {
    expect(() => buildImagePrompt(canon, { ...BRIEF, motif_key: 'rocket' }, { aspectRatio: '16:9' })).toThrow(/unknown motif/);
  });
});

describe('toBrandVisual', () => {
  it('maps the seeded row', () => {
    const canon = toBrandVisual(BRAND_VISUAL_V1_ROW);
    expect(canon.version).toBe('1.0');
    expect(canon.motifs).toHaveLength(10);
    expect(canon.palette.map((p) => p.hex)).toEqual(['#FAFAF8', '#1A1915', '#6B6860', '#C9A84C']);
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
  });

  it('drops malformed JSONB entries and defaults a missing brand_mark, rather than throwing', () => {
    const canon = toBrandVisual({
      ...BRAND_VISUAL_V1_ROW,
      motifs: [{ key: 'ledger', label: 'Ledger', is_active: false }, { nope: true }, 'junk'],
      palette: [{ hex: '#000' }],
      brand_mark: null,
      prohibited_terms: ['coin', '', 7],
    });
    expect(canon.motifs.map((m) => m.key)).toEqual(['ledger']);
    expect(activeMotifs(canon)).toEqual([]);
    expect(canon.palette).toEqual([]);
    expect(canon.brandMark).toEqual(DEFAULT_BRAND_MARK);
    expect(canon.prohibitedTerms).toEqual(['coin']);
  });
});
