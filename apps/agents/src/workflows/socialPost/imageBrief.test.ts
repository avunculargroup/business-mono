import { describe, it, expect } from 'vitest';
import { readStoredBrief } from '@platform/shared';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeLayouts, toBrandVisual } from './imagePrompt.js';
import {
  buildAltTextLexPrompt,
  buildImageBriefPrompt,
  buildImageCriticPrompt,
  FALLBACK_IMAGE_BRIEF,
  imageBriefOutputSchema,
  imageBriefRewriteInstruction,
  imageBriefSchema,
  layoutToRest,
  lintImageBrief,
  lintImageConcept,
  critiqueProblem,
  rankConcepts,
  recentImageHistory,
  reviewerRewriteInstruction,
  storedReview,
  type Critique,
  type ImageConcept,
} from './imageBrief.js';

const canon = toBrandVisual(BRAND_VISUAL_ROW);
const opts = { layouts: canon.layouts, prohibitedTerms: canon.prohibitedTerms };

const STAMP: ImageConcept = {
  tension: 'The rules are about to land, and everyone is waiting for the impact.',
  symbol: 'A rubber stamp',
  twist: 'Giant, its fresh print in gold on a blank sheet',
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
  const six = [STAMP, LIGHTHOUSE, GATE, STAMP, LIGHTHOUSE, GATE];

  it('asks a non-skip brief for exactly six concepts', () => {
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: six }).success).toBe(true);
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: six.slice(0, 5) }).success).toBe(false);
    expect(imageBriefSchema.safeParse({ ...BRIEF, concepts: [...six, STAMP] }).success).toBe(false);
  });

  it('lets a skip brief carry no concepts, and the fallback brief parse', () => {
    expect(imageBriefSchema.safeParse({ skip: true, skip_reason: 'No honest visual.', hook: '', concepts: [] }).success).toBe(true);
    expect(imageBriefSchema.safeParse(FALLBACK_IMAGE_BRIEF).success).toBe(true);
    expect(imageBriefOutputSchema.safeParse(FALLBACK_IMAGE_BRIEF).success).toBe(true);
  });

  it('accepts a short brief from the model, so it is reviewed rather than turned into a skip', () => {
    expect(imageBriefOutputSchema.safeParse({ ...BRIEF, concepts: six.slice(0, 4) }).success).toBe(true);
  });

  it('requires the hook', () => {
    const { hook: _hook, ...noHook } = { ...BRIEF, concepts: six };
    expect(imageBriefSchema.safeParse(noHook).success).toBe(false);
    expect(imageBriefOutputSchema.safeParse(noHook).success).toBe(false);
  });

  it('rejects the v1.1 drawn/undrawn shape', () => {
    const v11 = { tension: 't', subject: 's', drawn: 'd', undrawn: 'u', layout: 'hero_left', alt_text: 'a' };
    expect(imageBriefOutputSchema.safeParse({ ...BRIEF, concepts: [v11] }).success).toBe(false);
  });
});

describe('lintImageConcept', () => {
  it('passes a clean concept', () => {
    expect(lintImageConcept(STAMP, opts)).toEqual([]);
  });

  it('flags a twist that leans on a moment in time, and passes a visible half', () => {
    for (const twist of ['Poised above the sheet', 'About to land', 'not yet snapped', "The line hasn't been drawn", 'lifted mid-stroke', 'Waiting at the gate']) {
      expect(lintImageConcept({ ...STAMP, twist }, opts).join(' ')).toMatch(/twist leans on a moment in time/);
    }
    expect(lintImageConcept({ ...STAMP, symbol: 'A football pitch', twist: 'Half the pitch lined in gold' }, opts)).toEqual([]);
  });

  it('flags text-bearing symbols in symbol or subject, and lets a closed book through', () => {
    expect(lintImageConcept({ ...STAMP, symbol: 'A composing stick' }, opts).join(' ')).toMatch(/symbol depends on writing \(composing stick\)/);
    expect(lintImageConcept({ ...STAMP, subject: 'An open book on a desk' }, opts).join(' ')).toMatch(/subject depends on writing \(open book\)/);
    expect(lintImageConcept({ ...STAMP, symbol: 'A newspaper' }, opts).join(' ')).toMatch(/newspaper/);
    expect(lintImageConcept({ ...STAMP, symbol: 'A closed book', subject: 'A closed book bound in gold' }, opts)).toEqual([]);
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
    expect(p).toContain('Return exactly six concepts with six different symbols, using at least two different layouts.');
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
    expect(p).toContain('"capital buffers" became a heavy railway buffer stop printed in gold, a black rail running straight into it.');
  });

  it('drops the "about to land" stamp for examples whose twist can be seen, and names the pen as weak', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).not.toContain('rubber stamp');
    expect(p).not.toMatch(/about to land/);
    expect(p).toContain('"writing the playbook, not banning the game" became a football on a kicking tee on a freshly marked pitch, its touchline painted in gold.');
    expect(p).toContain('"the playbook" became a fountain pen lifted mid-stroke.');
  });

  it('carries the four rules: visible state, four domains, two hook puns, no writing', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('The twist is a visible physical state, never a moment in time.');
    expect(p).toContain('Half-finished is fine when the half can be seen');
    expect(p).toContain('at least four different domains');
    expect(p).toContain('at most two from any one domain');
    expect(p).toContain('At least two concepts pun on the hook\'s literal words.');
    expect(p).toContain('No symbol whose meaning depends on writing or letters');
    expect(p).toContain('A closed book is fine.');
  });

  it('carries a reviewer re-brief under its own heading, still asking for exactly six', () => {
    const p = buildImageBriefPrompt({ ...base, reviewerInstruction: '- A wax seal: signals approval (lowest: on_hook 2)' });
    expect(p).toContain('Return exactly six concepts');
    expect(p).toContain('## Re-brief: a reviewer rejected these concepts\n- A wax seal: signals approval (lowest: on_hook 2)');
  });

  it('carries the worked examples, weak and strong', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('Weak, a symbol with no twist: "Twenty years" became an hourglass.');
    expect(p).toContain('Weak, no symbol: a half-drawn bridge pier');
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
    expect(p).toContain('needs_text: true if the picture needs visible letters, numbers or writing to read.');
    expect(p).toContain('A twist that is a moment in time ("about to", "paused", "poised") scores 2 or less on twist_visible');
  });
});

function score(index: number, r: number, t: number, h: number, physics_ok = true, needs_text = false): Critique['scores'][number] {
  return { index, recognisable: r, twist_visible: t, on_hook: h, physics_ok, needs_text, note: `note ${index}` };
}

describe('rankConcepts', () => {
  const four = [SCALE, FARM_GATE, BUFFER, LIGHTHOUSE];

  it('rejects a physics failure and any score of 2 or less, puts the best first, and fills from the best soft reject', () => {
    const critique = { scores: [score(1, 5, 3, 3, false), score(2, 5, 1, 1), score(3, 5, 4, 5), score(4, 4, 3, 3)] };
    const r = rankConcepts(four, critique);
    expect(r.fallback).toBe(false);
    expect(r.passed).toBe(2);
    expect(r.ranked.map((x) => [x.concept.symbol, x.total, x.rank, x.filled])).toEqual([
      ['A railway buffer stop', 14, 1, false],
      ['A lighthouse', 10, 2, false],
      ['A farm gate', 7, 3, true],
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

  it('orders by total, not brief order, when a valid critique passes nothing, skipping physics and text faults', () => {
    // The "playbook" run: every idea rejected, and the chalk line (5/15) rendered anyway in brief order.
    const six = ['composing stick', 'fountain pen', 'chalk line', 'wax seal', 'galley tray', 'anvil'].map((symbol) => ({ ...STAMP, symbol }));
    const critique = {
      scores: [score(1, 2, 4, 4), score(2, 4, 4, 2), score(3, 2, 2, 1), score(4, 3, 4, 2, true, true), score(5, 1, 3, 4), score(6, 4, 3, 1, false)],
    };
    const r = rankConcepts(six, critique);
    expect(r.fallback).toBe(false);
    expect(r.passed).toBe(0);
    expect(r.ranked.map((x) => [x.concept.symbol, x.total, x.filled])).toEqual([
      ['composing stick', 10, true],
      ['fountain pen', 10, true],
      ['galley tray', 8, true],
    ]);
    expect(r.dropped.find((d) => d.index === 4)).toEqual({ index: 4, reason: 'needs visible text to read' });
  });

  it('drops a concept that needs visible text, however well it scores', () => {
    const r = rankConcepts([SCALE, BUFFER], { scores: [score(1, 5, 5, 5, true, true), score(2, 4, 4, 4)] });
    expect(r.ranked.map((x) => x.concept.symbol)).toEqual(['A railway buffer stop']);
    expect(r.dropped).toEqual([{ index: 1, reason: 'needs visible text to read' }]);
  });

  it('still renders, best total first, when every concept has a hard fault', () => {
    const r = rankConcepts([SCALE, FARM_GATE, BUFFER], {
      scores: [score(1, 3, 3, 3, false), score(2, 5, 5, 5, true, true), score(3, 4, 4, 4, false)],
    });
    expect(r).toMatchObject({ passed: 0, fallback: false });
    expect(r.ranked.map((x) => [x.concept.symbol, x.total, x.filled])).toEqual([
      ['A farm gate', 15, true],
      ['A railway buffer stop', 12, true],
      ['A balance scale', 9, true],
    ]);
  });

  it('prefers a soft reject over a hard fault when filling', () => {
    const r = rankConcepts([SCALE, FARM_GATE], { scores: [score(1, 5, 5, 5, false), score(2, 3, 2, 3)] });
    expect(r.ranked.map((x) => x.concept.symbol)).toEqual(['A farm gate']);
  });

  it('stores the review beside a ranked concept', () => {
    const r = rankConcepts([BUFFER], { scores: [score(1, 5, 4, 5)] });
    expect(storedReview(r.ranked[0]!)).toEqual({
      recognisable: 5,
      twist_visible: 4,
      on_hook: 5,
      physics_ok: true,
      needs_text: false,
      note: 'note 1',
      total: 14,
      rank: 1,
    });
  });
});

describe('reviewerRewriteInstruction', () => {
  it('lists each rejected symbol with its note and weakest point, bans reuse, and asks for other domains', () => {
    const text = reviewerRewriteInstruction(
      [
        { symbol: 'Chalk line', note: 'A taut string could be anything', scores: { recognisable: 2, twist_visible: 2, on_hook: 1, physics_ok: true, needs_text: false } },
        { symbol: 'Wax seal', note: 'Signals approval, not the playbook', scores: { recognisable: 3, twist_visible: 4, on_hook: 2, physics_ok: true, needs_text: true } },
      ],
      ['Composing stick', 'Chalk line'],
    );
    expect(text).toContain('- Chalk line: A taut string could be anything (lowest: on_hook 1)');
    expect(text).toContain('- Wax seal: Signals approval, not the playbook (needs visible text)');
    expect(text).toContain('Do not reuse any of these symbols: Composing stick; Chalk line; Wax seal.');
    expect(text).toContain('Find symbols from different domains');
  });
});

describe('buildAltTextLexPrompt', () => {
  it('offers no disclaimer keys', () => {
    const p = buildAltTextLexPrompt('A linocut of a lighthouse.');
    expect(p).toContain('A linocut of a lighthouse.');
    expect(p).toContain('needs_disclaimer = false');
  });
});

describe('critiqueProblem', () => {
  const ok = (index: number) => ({ index, recognisable: 4, twist_visible: 4, on_hook: 4, physics_ok: true, needs_text: false, note: 'n' });

  it('is null for a usable critique', () => {
    expect(critiqueProblem({ scores: [ok(1), ok(2)] }, 2)).toBeNull();
  });

  it('names each way a critique cannot be ranked on', () => {
    expect(critiqueProblem(null, 3)).toBe('no critique returned');
    expect(critiqueProblem({ scores: [] }, 3)).toBe('no scores returned');
    expect(critiqueProblem({ scores: [{ index: 1 }] }, 3)).toMatch(/^malformed critique: scores\.0\./);
    expect(critiqueProblem({ scores: [ok(1), ok(7), ok(8)] }, 3)).toBe('indices outside 1–3: 7, 8');
    expect(critiqueProblem({ scores: [ok(1), ok(1), ok(9)] }, 3)).toBe('indices outside 1–3: 9; scored twice: 1');
  });

  it('agrees with rankConcepts about when to fall back', () => {
    for (const critique of [null, { scores: [] }, { scores: [ok(4)] }, { scores: [ok(1), ok(1)] }, { scores: [ok(1)] }]) {
      const concepts = [STAMP, LIGHTHOUSE, GATE];
      expect(critiqueProblem(critique, 3) !== null).toBe(rankConcepts(concepts, critique as Critique | null).fallback);
    }
  });
});
