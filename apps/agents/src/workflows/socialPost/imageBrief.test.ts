import { describe, it, expect } from 'vitest';
import { readStoredBrief } from '@platform/shared';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeLayouts, toBrandVisual } from './imagePrompt.js';
import {
  buildAltTextLexPrompt,
  buildImageBriefPrompt,
  buildImageCriticPrompt,
  imageBriefRewriteInstruction,
  imageBriefSchema,
  layoutToRest,
  lintImageBrief,
  lintImageConcept,
  rankConcepts,
  recentImageHistory,
  storedReview,
  type Critique,
  type ImageConcept,
} from './imageBrief.js';

const canon = toBrandVisual(BRAND_VISUAL_ROW);
const opts = { layouts: canon.layouts, prohibitedTerms: canon.prohibitedTerms };

const STAMP: ImageConcept = {
  tension: 'The rules are about to land, and everyone is waiting for the impact.',
  symbol: 'A rubber stamp',
  twist: 'Giant, poised just above a blank sheet, about to land',
  subject: 'A giant rubber stamp hovering just above a blank sheet of paper',
  layout: 'hero_left',
  alt_text: 'A linocut of a huge rubber stamp about to come down on a blank page.',
};
const LIGHTHOUSE: ImageConcept = {
  tension: 'After years of fog, clarity is coming.',
  symbol: 'A lighthouse',
  twist: 'One solid gold beam cuts through the fog',
  subject: 'A lighthouse throwing one solid gold beam through dense fog',
  layout: 'against_gold',
  alt_text: 'A linocut of a lighthouse with a gold beam through fog.',
};
const GATE: ImageConcept = {
  tension: 'A hundred and forty firms are queueing at a door that is not open yet.',
  symbol: 'A turnstile',
  twist: 'Locked, with a long queue of briefcases behind it',
  subject: 'A locked turnstile with a long line of briefcases behind it',
  layout: 'diagonal',
  alt_text: 'A linocut of a locked turnstile with briefcases queued behind it.',
};
const BRIEF = { skip: false, skip_reason: null, hook: "Clarity's coming", concepts: [STAMP, LIGHTHOUSE, GATE] };

const CP392 =
  "140 businesses have applied to offer digital asset services in Australia.\n\nASIC just dropped Consultation Paper 392 — the rulebook for custody, settlement, and capital requirements under the new Digital Assets Framework Act.\n\nClarity's coming. April 2027.\n\nNot nothing.";

describe('imageBriefSchema', () => {
  it('accepts up to six v1.2 concepts and rejects a seventh', () => {
    expect(imageBriefSchema.safeParse(BRIEF).success).toBe(true);
    const six = [STAMP, LIGHTHOUSE, GATE, STAMP, LIGHTHOUSE, GATE];
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: six }).success).toBe(true);
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: [...six, STAMP] }).success).toBe(false);
  });

  it('requires the hook', () => {
    const { hook: _hook, ...noHook } = BRIEF;
    expect(imageBriefSchema.safeParse(noHook).success).toBe(false);
  });

  it('rejects the v1.1 drawn/undrawn shape', () => {
    const v11 = { tension: 't', subject: 's', drawn: 'd', undrawn: 'u', layout: 'hero_left', alt_text: 'a' };
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: [v11] }).success).toBe(false);
  });
});

describe('lintImageConcept', () => {
  it('passes a clean concept', () => {
    expect(lintImageConcept(STAMP, opts)).toEqual([]);
  });

  it('requires symbol, twist, subject, tension and alt text', () => {
    const flags = lintImageConcept({ ...STAMP, symbol: '', twist: ' ', subject: '', tension: '', alt_text: '' }, opts);
    expect(flags).toEqual(
      expect.arrayContaining(['symbol is missing.', 'twist is missing.', 'subject is missing.', 'tension is missing.', 'alt_text is missing.']),
    );
  });

  it('flags a twist that only restates the symbol', () => {
    expect(lintImageConcept({ ...STAMP, twist: 'a Rubber stamp.' }, opts).join(' ')).toMatch(/twist only restates the symbol/);
  });

  it('lets familiar symbols through: the v1.1 stock-symbol ban is lifted', () => {
    const hourglass = { ...STAMP, symbol: 'An hourglass', twist: 'The sand runs upwards', subject: 'An hourglass whose sand runs upwards' };
    expect(lintImageConcept(hourglass, opts)).toEqual([]);
  });

  it('still rejects finance clichés in subject, symbol or twist', () => {
    expect(lintImageConcept({ ...STAMP, symbol: 'A rocket' }, opts).join(' ')).toMatch(/symbol names prohibited imagery: rocket/);
    expect(lintImageConcept({ ...STAMP, twist: 'a gold coin under it' }, opts).join(' ')).toMatch(/twist names prohibited imagery: coin/);
    expect(lintImageConcept({ ...STAMP, subject: 'A stamp over a price chart' }, opts).join(' ')).toMatch(/subject names prohibited imagery: chart/);
  });

  it('flags digits, which invite rendered text', () => {
    expect(lintImageConcept({ ...STAMP, twist: 'stamped 2027' }, opts).join(' ')).toMatch(/twist contains digits/);
  });

  it('requires an active layout: v1.1 layouts are retired', () => {
    expect(lintImageConcept({ ...STAMP, layout: 'left_third' }, opts).join(' ')).toMatch(/layout "left_third" is not one of the listed layouts/);
  });
});

describe('lintImageBrief', () => {
  it('keeps clean concepts and drops flagged ones, numbering their flags', () => {
    const lint = lintImageBrief({ ...BRIEF, concepts: [STAMP, { ...LIGHTHOUSE, symbol: 'A rocket' }, GATE] }, opts);
    expect(lint.clean).toEqual([STAMP, GATE]);
    expect(lint.flags).toEqual(['Concept 2: symbol names prohibited imagery: rocket.']);
  });

  it('drops a concept that repeats an earlier symbol', () => {
    const lint = lintImageBrief({ ...BRIEF, concepts: [STAMP, { ...GATE, symbol: 'a rubber stamp' }] }, opts);
    expect(lint.clean).toEqual([STAMP]);
    expect(lint.flags[0]).toMatch(/Concept 2: symbol repeats an earlier concept/);
  });

  it('says so when the brief returned no concepts, and treats a skip as clean', () => {
    expect(lintImageBrief({ skip: false, skip_reason: null, hook: '', concepts: [] }, opts).flags).toEqual(['The brief returned no concepts.']);
    expect(lintImageBrief({ skip: true, skip_reason: 'quiet', hook: '', concepts: [] }, opts)).toEqual({ clean: [], flags: [] });
  });

  it('allows digits in the hook only', () => {
    expect(lintImageBrief({ ...BRIEF, hook: '140 applicants' }, opts)).toEqual({ clean: [STAMP, LIGHTHOUSE, GATE], flags: [] });
    expect(lintImageBrief({ ...BRIEF, hook: '140 applicants', concepts: [{ ...STAMP, symbol: '140 stamps' }] }, opts).flags[0]).toMatch(
      /symbol contains digits/,
    );
  });

  it('lints up to six concepts', () => {
    const six = ['a door', 'a bell', 'a kite', 'a well', 'a drum', 'a sail'].map((symbol) => ({ ...STAMP, symbol }));
    expect(lintImageBrief({ ...BRIEF, concepts: [...six, { ...STAMP, symbol: 'a seventh' }] }, opts).clean).toHaveLength(6);
  });
});

describe('imageBriefRewriteInstruction', () => {
  it('is null when clean and lists each flag otherwise', () => {
    expect(imageBriefRewriteInstruction([])).toBeNull();
    expect(imageBriefRewriteInstruction(['Concept 1: a.', 'Concept 2: b.'])).toBe('- Concept 1: a.\n- Concept 2: b.');
  });
});

describe('readStoredBrief', () => {
  it('reads a v1.2 concept, with the full concept for Edit brief', () => {
    expect(readStoredBrief(STAMP)).toEqual({
      kind: 'concept',
      tension: STAMP.tension,
      subject: STAMP.subject,
      symbol: 'A rubber stamp',
      layout: 'hero_left',
      motifKey: null,
      concept: STAMP,
      hook: null,
      review: null,
    });
  });

  it('reads the hook and the review stored beside a reviewed concept, and a fallback review as null', () => {
    const review = { recognisable: 5, twist_visible: 4, on_hook: 5, physics_ok: true, note: 'A pun on the exact words.', total: 14, rank: 1 };
    const stored = readStoredBrief({ ...STAMP, hook: 'capital buffers', review });
    expect(stored).toMatchObject({ kind: 'concept', hook: 'capital buffers', review, concept: STAMP });
    expect(readStoredBrief({ ...STAMP, hook: 'capital buffers', review: null })).toMatchObject({ hook: 'capital buffers', review: null });
  });

  it('reads a v1.1 drawn/undrawn brief without throwing', () => {
    const v11 = { tension: 'Nobody knows the trigger.', subject: 'A timber pier', drawn: 'near end', undrawn: 'far end', layout: 'left_third', alt_text: 'x' };
    expect(readStoredBrief(v11)).toEqual({
      kind: 'drawn',
      tension: 'Nobody knows the trigger.',
      subject: 'A timber pier',
      symbol: null,
      layout: 'left_third',
      motifKey: null,
      concept: null,
      hook: null,
      review: null,
    });
  });

  it('reads a v1.0 motif brief without throwing', () => {
    const v10 = { skip: false, skip_reason: null, motif_key: 'timepiece', subject: 'An hourglass', metaphor: 'time', composition: null, alt_text: 'x' };
    expect(readStoredBrief(v10)).toEqual({
      kind: 'legacy',
      tension: null,
      subject: 'An hourglass',
      symbol: null,
      layout: null,
      motifKey: 'timepiece',
      concept: null,
      hook: null,
      review: null,
    });
  });

  it('reads anything else as null', () => {
    expect(readStoredBrief(null)).toBeNull();
    expect(readStoredBrief('brief')).toBeNull();
    expect(readStoredBrief([STAMP])).toBeNull();
    expect(readStoredBrief({ unrelated: true })).toBeNull();
  });
});

describe('recentImageHistory', () => {
  it('reads the selected image of each run, most recent first, from every brief shape', () => {
    const rows = [
      { candidate_set_id: 'A', generation_group_id: 'a1', is_selected: true, image_brief: STAMP },
      { candidate_set_id: 'A', generation_group_id: 'a1', is_selected: true, image_brief: STAMP },
      { candidate_set_id: 'A', generation_group_id: 'a2', is_selected: false, image_brief: GATE },
      // a v1.1 image: no symbol, its subject stands in
      { candidate_set_id: 'B', generation_group_id: 'b1', is_selected: true, image_brief: { tension: 't', subject: 'A half-drawn bridge pier', drawn: 'd', undrawn: 'u', layout: 'left_third', alt_text: 'x' } },
      // a v1.0 image
      { candidate_set_id: null, generation_group_id: 'old', is_selected: true, image_brief: { motif_key: 'timepiece', subject: 'An hourglass', metaphor: 'time' } },
    ];
    expect(recentImageHistory(rows)).toEqual({
      symbols: ['A rubber stamp', 'A half-drawn bridge pier', 'An hourglass'],
      layouts: ['hero_left', 'left_third'],
    });
  });

  it('stops at five runs and degrades to no history on a bad read', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ candidate_set_id: `s${i}`, is_selected: true, image_brief: { ...STAMP, symbol: `Symbol ${i}` } }));
    expect(recentImageHistory(rows).symbols).toHaveLength(5);
    expect(recentImageHistory(null)).toEqual({ symbols: [], layouts: [] });
  });

  it('names the layout to rest only after two runs in a row used it', () => {
    expect(layoutToRest({ symbols: [], layouts: ['hero_left', 'hero_left'] })).toBe('hero_left');
    expect(layoutToRest({ symbols: [], layouts: ['hero_left', 'diagonal'] })).toBeNull();
  });
});

describe('buildImageBriefPrompt', () => {
  const base = {
    story: { title: 'ASIC releases CP 392', summary: 'The rulebook for digital asset services.', key_points: ['140 applicants'] },
    form: 'flat_observation',
    postCopy: CP392,
    layouts: activeLayouts(canon),
    history: { symbols: [], layouts: [] },
    prohibitedTerms: canon.prohibitedTerms,
  };

  it('asks for a familiar symbol with one twist, tested at phone size', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain(CP392);
    expect(p).toContain('## The half-second test');
    expect(p).toContain('2. symbol: an object, place or tool everyone already knows.');
    expect(p).toContain('3. twist: one change to the symbol that ties it to the hook and the tension. One change only.');
    expect(p).toContain('would someone scrolling past at phone size recognise the symbol and get the twist without reading the post?');
    expect(p).toContain('Return six concepts with six different symbols, using at least two different layouts.');
    expect(p).toContain('a reviewer will shortlist them');
    for (const l of activeLayouts(canon)) expect(p).toContain(`- ${l.key} (${l.label}):`);
    expect(p).not.toContain('left_third');
  });

  it('names the hook first, before the tension, and welcomes puns on it', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('hook: the single most specific, concrete phrase in the post.');
    expect(p).toContain('"capital buffers", not "regulation"; "Twenty years", not "US debt"');
    expect(p).toContain('Visual puns on the hook\'s words are welcome');
    expect(p.indexOf('## First, the hook')).toBeGreaterThan(-1);
    expect(p.indexOf('## First, the hook')).toBeLessThan(p.indexOf('1. tension:'));
  });

  it('asks for physics that reads correctly', () => {
    expect(buildImageBriefPrompt(base)).toContain('A weighted pan sits lower; light comes from its source; water finds its level.');
  });

  it('carries the capital-buffers examples', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('"capital buffers" became a balance scale. It says "regulation", and this one had the weighted pan sitting higher.');
    expect(p).toContain('"capital buffers" became a closed farm gate.');
    expect(p).toContain('"capital buffers" became a heavy railway buffer stop in gold, a black rail running straight into it.');
  });

  it('carries the worked examples, weak and strong', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('Weak, a symbol with no twist: "Twenty years" became an hourglass.');
    expect(p).toContain('Weak, no symbol: a half-drawn bridge pier');
    expect(p).toContain('a giant rubber stamp poised just above a blank sheet');
    expect(p).toContain('a lighthouse throwing one solid gold beam through fog');
  });

  it('tells it not to reuse recent symbols, and to rest a layout used twice in a row', () => {
    const p = buildImageBriefPrompt({ ...base, history: { symbols: ['A rubber stamp', 'A lighthouse'], layouts: ['diagonal', 'diagonal'] } });
    expect(p).toContain('Recent images used: A rubber stamp; A lighthouse. Do not use any of these symbols again.');
    expect(p).toContain('Do not use diagonal in any concept.');
  });

  it('works from the post alone when the story is not known, and carries re-brief flags', () => {
    const p = buildImageBriefPrompt({ ...base, story: null, form: null, rewriteInstruction: '- Concept 1: twist is missing.' });
    expect(p).not.toContain('## The story behind it');
    expect(p).toContain('## Re-brief: none of your concepts could be used, for these reasons');
    expect(p).toContain('- Concept 1: twist is missing.');
  });
});

const BUFFERS_POST =
  "ASIC's consultation paper for digital asset platforms dropped last week.\n\nBuried in there: net tangible asset requirements.\n\nNot just custody rules. Not just settlement standards. Capital buffers.\n\nSubmissions close 27 November.";
const SCALE: ImageConcept = { ...STAMP, symbol: 'A balance scale', twist: 'One pan holds a heavy weight', subject: 'A balance scale with a heavy weight' };
const FARM_GATE: ImageConcept = { ...STAMP, symbol: 'A farm gate', twist: 'Shut and bolted', subject: 'A closed farm gate' };
const BUFFER: ImageConcept = { ...STAMP, symbol: 'A railway buffer stop', twist: 'Heavy and gold, a rail running into it', subject: 'A gold railway buffer stop at the end of a black rail' };

describe('buildImageCriticPrompt', () => {
  it('numbers the concepts, names the hook and carries the calibration', () => {
    const p = buildImageCriticPrompt({ postCopy: BUFFERS_POST, hook: 'capital buffers', concepts: [SCALE, FARM_GATE, BUFFER] });
    expect(p).toContain(BUFFERS_POST);
    expect(p).toContain('## The hook\ncapital buffers');
    expect(p).toContain('1. Symbol: A balance scale');
    expect(p).toContain('2. Symbol: A farm gate');
    expect(p).toContain('3. Symbol: A railway buffer stop\n   Twist: Heavy and gold, a rail running into it');
    expect(p).toContain('Be strict');
    expect(p).toContain('A plain symbol with no twist scores 1.');
    expect(p).toContain('A picture of the general topic scores 1.');
    expect(p).toContain('A balance scale with the weighted pan sitting higher');
    expect(p).toContain('A closed farm gate');
    expect(p).toContain('A heavy railway buffer stop in gold');
  });
});

function score(index: number, r: number, t: number, h: number, physics_ok = true): Critique['scores'][number] {
  return { index, recognisable: r, twist_visible: t, on_hook: h, physics_ok, note: `note ${index}` };
}

describe('rankConcepts', () => {
  const four = [SCALE, FARM_GATE, BUFFER, LIGHTHOUSE];

  it('drops a physics failure and any score of 2 or less, and puts the best first', () => {
    const critique = { scores: [score(1, 5, 3, 3, false), score(2, 5, 1, 1), score(3, 5, 4, 5), score(4, 4, 3, 3)] };
    const r = rankConcepts(four, critique);
    expect(r.fallback).toBe(false);
    expect(r.ranked.map((x) => [x.concept.symbol, x.total, x.rank])).toEqual([
      ['A railway buffer stop', 14, 1],
      ['A lighthouse', 10, 2],
    ]);
    expect(r.dropped).toEqual([
      { index: 1, reason: 'physics reads wrong' },
      { index: 2, reason: 'scored 2 or less on twist_visible, on_hook' },
    ]);
  });

  it('keeps brief order on a tie and caps at max', () => {
    const critique = { scores: [score(1, 4, 4, 4), score(2, 4, 4, 4), score(3, 5, 5, 5), score(4, 4, 4, 4)] };
    const r = rankConcepts(four, critique, 3);
    expect(r.ranked.map((x) => x.concept.symbol)).toEqual(['A railway buffer stop', 'A balance scale', 'A farm gate']);
  });

  it('ranks unscored concepts after every scored one, and never drops them', () => {
    const r = rankConcepts(four, { scores: [score(2, 3, 3, 3), score(4, 4, 4, 4)] }, 4);
    expect(r.ranked.map((x) => [x.concept.symbol, x.total])).toEqual([
      ['A lighthouse', 12],
      ['A farm gate', 9],
      ['A balance scale', null],
      ['A railway buffer stop', null],
    ]);
    expect(r.dropped).toEqual([]);
    expect(storedReview(r.ranked[2]!)).toBeNull();
  });

  it('falls back to brief order when the critique is missing, malformed or lost track of the indices', () => {
    for (const critique of [
      null,
      { scores: [] },
      { scores: [{ index: 1, recognisable: 9 }] } as unknown as Critique,
      { scores: [score(7, 5, 5, 5)] },
      { scores: [score(1, 5, 5, 5), score(1, 4, 4, 4)] },
    ]) {
      const r = rankConcepts(four, critique);
      expect(r.fallback).toBe(true);
      expect(r.ranked.map((x) => [x.concept.symbol, x.total, x.rank])).toEqual([
        ['A balance scale', null, 1],
        ['A farm gate', null, 2],
        ['A railway buffer stop', null, 3],
      ]);
    }
  });

  it('falls back when nothing survives the filter', () => {
    const r = rankConcepts(four, { scores: [score(1, 1, 1, 1), score(2, 2, 2, 2), score(3, 5, 5, 5, false), score(4, 5, 2, 5)] });
    expect(r.fallback).toBe(true);
    expect(r.ranked.map((x) => x.concept.symbol)).toEqual(['A balance scale', 'A farm gate', 'A railway buffer stop']);
    expect(r.dropped).toEqual([]);
  });

  it('stores the review beside a ranked concept', () => {
    const r = rankConcepts([BUFFER], { scores: [score(1, 5, 4, 5)] });
    expect(storedReview(r.ranked[0]!)).toEqual({ recognisable: 5, twist_visible: 4, on_hook: 5, physics_ok: true, note: 'note 1', total: 14, rank: 1 });
  });
});

describe('buildAltTextLexPrompt', () => {
  it('offers no disclaimer keys', () => {
    const p = buildAltTextLexPrompt('A linocut of a lighthouse.');
    expect(p).toContain('A linocut of a lighthouse.');
    expect(p).toContain('needs_disclaimer = false');
  });
});
