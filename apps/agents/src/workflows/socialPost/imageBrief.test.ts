import { describe, it, expect } from 'vitest';
import { readStoredBrief } from '@platform/shared';
import { BRAND_VISUAL_ROW } from '../../../test/fixtures/brandVisual.js';
import { activeLayouts, toBrandVisual } from './imagePrompt.js';
import {
  buildAltTextLexPrompt,
  buildImageBriefPrompt,
  imageBriefRewriteInstruction,
  imageBriefSchema,
  layoutToRest,
  lintImageBrief,
  lintImageConcept,
  recentImageHistory,
  type ImageConcept,
} from './imageBrief.js';

const canon = toBrandVisual(BRAND_VISUAL_ROW);
const opts = { layouts: canon.layouts, prohibitedTerms: canon.prohibitedTerms };

const PIER: ImageConcept = {
  tension: 'Nobody knows the trigger, only that the safe ground is shorter than it looks.',
  subject: 'A timber pier running out over open water',
  drawn: 'the near end of the pier, planks and pilings',
  undrawn: 'the far end, planks thinning into pencil guidelines over the water',
  layout: 'left_third',
  alt_text: 'A pencil sketch of a pier whose far end is only outlined.',
};
const BRIDGE: ImageConcept = {
  ...PIER,
  subject: 'A footbridge half built across a gorge',
  drawn: 'the near abutment and first spans',
  undrawn: 'the spans that would reach the far side',
  layout: 'low_horizon',
};
const ROAD: ImageConcept = {
  ...PIER,
  subject: 'A surveyed road that stops at a field edge',
  drawn: 'the paved stretch nearest the viewer',
  undrawn: 'the pegged-out route beyond the field',
  layout: 'small_in_space',
};

// The real post the v1.1 change was made for.
const TWENTY_YEARS =
  "Twenty years.\n\nThat's Penn Wharton's outer limit before the US either defaults or prints its way out. Could be 14.\n\nThe trigger? Nobody knows. Dr Kent Smetters says it's whenever markets stop believing Congress will fix it.\n\nPretty easy to see why some CFOs are quietly rethinking what 'safe' means.";

describe('imageBriefSchema', () => {
  it('accepts up to three concepts and rejects a fourth', () => {
    expect(imageBriefSchema.safeParse({ skip: false, skip_reason: null, concepts: [PIER, BRIDGE, ROAD] }).success).toBe(true);
    expect(imageBriefSchema.safeParse({ skip: false, skip_reason: null, concepts: [PIER, BRIDGE, ROAD, PIER] }).success).toBe(false);
  });

  it('accepts a skip with no concepts', () => {
    expect(imageBriefSchema.safeParse({ skip: true, skip_reason: 'No honest visual.', concepts: [] }).success).toBe(true);
  });
});

describe('lintImageConcept', () => {
  it('passes a clean concept', () => {
    expect(lintImageConcept(PIER, opts)).toEqual([]);
  });

  it('requires an active layout', () => {
    expect(lintImageConcept({ ...PIER, layout: 'centred' }, opts).join(' ')).toMatch(/layout "centred" is not one of the listed layouts/);
    const retired = canon.layouts.map((l) => (l.key === 'left_third' ? { ...l, is_active: false } : l));
    expect(lintImageConcept(PIER, { ...opts, layouts: retired })).toHaveLength(1);
  });

  it.each(['', 'none', 'None.', 'n/a', 'nothing'])('requires the undrawn part (%j is not one)', (undrawn) => {
    expect(lintImageConcept({ ...PIER, undrawn }, opts).join(' ')).toMatch(/undrawn is missing/);
  });

  it('flags stock symbols in subject, drawn or undrawn', () => {
    const flags = lintImageConcept({ ...PIER, subject: 'An hourglass on a desk', drawn: 'the upper bulb of the hourglass' }, opts);
    expect(flags).toEqual(
      expect.arrayContaining(['subject names prohibited imagery: hourglass.', 'drawn names prohibited imagery: hourglass.']),
    );
    expect(lintImageConcept({ ...PIER, undrawn: 'the rest of the vault door' }, opts).join(' ')).toMatch(/undrawn names prohibited imagery: vault door/);
  });

  it('matches whole words only: "keystone" is not "key", "clockwise" is not "clock"', () => {
    expect(lintImageConcept({ ...PIER, subject: 'An arch missing its keystone, turning clockwise' }, opts)).toEqual([]);
  });

  it('flags digits, which invite rendered text', () => {
    expect(lintImageConcept({ ...PIER, drawn: 'the first 14 planks' }, opts).join(' ')).toMatch(/drawn contains digits/);
  });

  it('requires tension, subject, drawn and alt text', () => {
    const flags = lintImageConcept({ ...PIER, tension: ' ', subject: '', drawn: '', alt_text: '' }, opts);
    expect(flags).toEqual(
      expect.arrayContaining(['tension is missing.', 'subject is missing.', 'drawn is missing.', 'alt_text is missing.']),
    );
  });
});

describe('lintImageBrief', () => {
  it('keeps clean concepts and drops flagged ones, numbering their flags', () => {
    const lint = lintImageBrief({ skip: false, skip_reason: null, concepts: [PIER, { ...BRIDGE, subject: 'A clock tower' }, ROAD] }, opts);
    expect(lint.clean).toEqual([PIER, ROAD]);
    expect(lint.flags).toEqual(['Concept 2: subject names prohibited imagery: clock.']);
  });

  it('drops a concept that repeats an earlier subject', () => {
    const lint = lintImageBrief({ skip: false, skip_reason: null, concepts: [PIER, { ...PIER, layout: 'low_horizon' }] }, opts);
    expect(lint.clean).toEqual([PIER]);
    expect(lint.flags[0]).toMatch(/Concept 2: subject repeats an earlier concept/);
  });

  it('says so when the brief returned no concepts, and treats a skip as clean', () => {
    expect(lintImageBrief({ skip: false, skip_reason: null, concepts: [] }, opts).flags).toEqual(['The brief returned no concepts.']);
    expect(lintImageBrief({ skip: true, skip_reason: 'quiet', concepts: [] }, opts)).toEqual({ clean: [], flags: [] });
  });
});

describe('imageBriefRewriteInstruction', () => {
  it('is null when clean and lists each flag otherwise', () => {
    expect(imageBriefRewriteInstruction([])).toBeNull();
    expect(imageBriefRewriteInstruction(['Concept 1: a.', 'Concept 2: b.'])).toBe('- Concept 1: a.\n- Concept 2: b.');
  });
});

describe('recentImageHistory', () => {
  it('reads selected images, one per run, most recent first, from either brief shape', () => {
    const rows = [
      // run A: three candidates over two platforms; only the selected group counts
      { candidate_set_id: 'A', generation_group_id: 'a1', is_selected: true, image_brief: PIER },
      { candidate_set_id: 'A', generation_group_id: 'a1', is_selected: true, image_brief: PIER },
      { candidate_set_id: 'A', generation_group_id: 'a2', is_selected: false, image_brief: BRIDGE },
      // run B
      { candidate_set_id: 'B', generation_group_id: 'b1', is_selected: true, image_brief: ROAD },
      // a v1.0 image, before candidate sets
      { candidate_set_id: null, generation_group_id: 'old', is_selected: true, image_brief: { motif_key: 'timepiece', subject: 'An hourglass', metaphor: 'time', composition: null } },
    ];
    expect(recentImageHistory(rows)).toEqual({
      subjects: [PIER.subject, ROAD.subject, 'An hourglass'],
      layouts: ['left_third', 'small_in_space'],
    });
  });

  it('stops at five runs and degrades to no history on a bad read', () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ candidate_set_id: `s${i}`, is_selected: true, image_brief: { ...PIER, subject: `Subject ${i}` } }));
    expect(recentImageHistory(rows).subjects).toHaveLength(5);
    expect(recentImageHistory(null)).toEqual({ subjects: [], layouts: [] });
  });

  it('names the layout to rest only after two runs in a row used it', () => {
    expect(layoutToRest({ subjects: [], layouts: ['left_third', 'left_third', 'low_horizon'] })).toBe('left_third');
    expect(layoutToRest({ subjects: [], layouts: ['left_third', 'low_horizon'] })).toBeNull();
    expect(layoutToRest({ subjects: [], layouts: ['left_third'] })).toBeNull();
  });
});

describe('readStoredBrief', () => {
  it('reads a v1.1 concept', () => {
    expect(readStoredBrief(PIER)).toMatchObject({ kind: 'concept', tension: PIER.tension, subject: PIER.subject, layout: 'left_third', concept: PIER });
  });

  it('reads a v1.0 brief without throwing', () => {
    const v1 = { skip: false, skip_reason: null, motif_key: 'timepiece', subject: 'An hourglass', metaphor: 'time', composition: null, alt_text: 'x' };
    expect(readStoredBrief(v1)).toEqual({ kind: 'legacy', tension: null, subject: 'An hourglass', layout: null, motifKey: 'timepiece', concept: null });
  });

  it('reads anything else as null', () => {
    expect(readStoredBrief(null)).toBeNull();
    expect(readStoredBrief('brief')).toBeNull();
    expect(readStoredBrief([PIER])).toBeNull();
    expect(readStoredBrief({ unrelated: true })).toBeNull();
  });
});

describe('buildImageBriefPrompt', () => {
  const base = {
    story: { title: 'Penn Wharton: debt limits', summary: 'Twenty years, maybe fourteen.', key_points: ['20 years'] },
    form: 'flat_observation',
    postCopy: TWENTY_YEARS,
    layouts: activeLayouts(canon),
    history: { subjects: [], layouts: [] },
    prohibitedTerms: canon.prohibitedTerms,
  };

  it('asks for the tension before the subject, three concepts, and the device', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain(TWENTY_YEARS);
    expect(p.indexOf('1. tension')).toBeLessThan(p.indexOf('2. subject'));
    expect(p).toContain('Return three concepts with three different subjects, using at least two different layouts.');
    expect(p).toContain('left as faint construction lines only');
    for (const l of activeLayouts(canon)) expect(p).toContain(`- ${l.key} (${l.label}):`);
    expect(p).toContain('hourglass');
    expect(p).not.toContain('Recent images');
    expect(p).not.toContain('Re-brief');
  });

  it('tells it not to repeat recent subjects, and to rest a layout used twice in a row', () => {
    const p = buildImageBriefPrompt({
      ...base,
      history: { subjects: ['A timber pier', 'A half-built bridge'], layouts: ['left_third', 'left_third'] },
    });
    expect(p).toContain('Recent images showed: A timber pier; A half-built bridge. Do not repeat any of these subjects.');
    expect(p).toContain('The last two images both used the left_third layout. Do not use left_third in any concept.');
  });

  it('works from the post alone when the story is not known', () => {
    const p = buildImageBriefPrompt({ ...base, story: null, form: null });
    expect(p).not.toContain('## The story behind it');
    expect(p).toContain('## The post\n');
  });

  it('carries the flags on a re-brief', () => {
    const p = buildImageBriefPrompt({ ...base, rewriteInstruction: '- Concept 1: subject names prohibited imagery: hourglass.' });
    expect(p).toContain('## Re-brief: none of your concepts could be used, for these reasons');
    expect(p).toContain('- Concept 1: subject names prohibited imagery: hourglass.');
  });
});

describe('buildAltTextLexPrompt', () => {
  it('offers no disclaimer keys', () => {
    const p = buildAltTextLexPrompt('A sketch of a pier.');
    expect(p).toContain('A sketch of a pier.');
    expect(p).toContain('needs_disclaimer = false');
  });
});
