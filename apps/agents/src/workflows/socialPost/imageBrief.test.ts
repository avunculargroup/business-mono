import { describe, it, expect } from 'vitest';
import { BRAND_VISUAL_V1_ROW } from '../../../test/fixtures/brandVisual.js';
import { toBrandVisual } from './imagePrompt.js';
import {
  buildAltTextLexPrompt,
  buildImageBriefPrompt,
  imageBriefRewriteInstruction,
  lintImageBrief,
  recentMotifs,
  type ImageBrief,
} from './imageBrief.js';

const canon = toBrandVisual(BRAND_VISUAL_V1_ROW);
const opts = { motifs: canon.motifs, prohibitedTerms: canon.prohibitedTerms };

const CLEAN: ImageBrief = {
  skip: false,
  skip_reason: null,
  motif_key: 'ledger',
  subject: 'An open ledger book with one ruled entry picked out',
  metaphor: 'disclosure is a single honest line in the books',
  composition: null,
  alt_text: 'A pencil sketch of an open ledger with one highlighted line.',
};

describe('lintImageBrief', () => {
  it('passes a clean brief', () => {
    expect(lintImageBrief(CLEAN, opts)).toEqual([]);
  });

  it('passes any skip brief — the quiet path needs no fields', () => {
    expect(lintImageBrief({ ...CLEAN, skip: true, motif_key: null, alt_text: null, subject: 'rocket' }, opts)).toEqual([]);
  });

  it('flags a motif outside the active vocabulary', () => {
    const flags = lintImageBrief({ ...CLEAN, motif_key: 'rocketship' }, opts);
    expect(flags.join(' ')).toMatch(/not one of the listed motifs/);
  });

  it('flags a retired motif', () => {
    const retired = canon.motifs.map((m) => (m.key === 'ledger' ? { ...m, is_active: false } : m));
    expect(lintImageBrief(CLEAN, { ...opts, motifs: retired })).toHaveLength(1);
  });

  it('flags prohibited imagery on word boundaries, case-insensitively', () => {
    const flags = lintImageBrief({ ...CLEAN, metaphor: 'a Rocket leaving the books behind' }, opts);
    expect(flags.join(' ')).toMatch(/metaphor names prohibited imagery: rocket/);
    // "chartered" is not "chart", "bullet" is not "bull".
    expect(lintImageBrief({ ...CLEAN, subject: 'A chartered accountant’s bullet journal' }, opts)).toEqual([]);
  });

  it('matches symbol terms (₿, $) as substrings', () => {
    const flags = lintImageBrief({ ...CLEAN, composition: 'a faint $ sign in the margin' }, opts);
    expect(flags.join(' ')).toMatch(/composition names prohibited imagery: \$/);
  });

  it('flags digits in subject or metaphor, which invite rendered text', () => {
    const flags = lintImageBrief({ ...CLEAN, subject: 'A ledger dated 2026' }, opts);
    expect(flags.join(' ')).toMatch(/subject contains digits/);
  });

  it('requires alt text and a subject when not skipping', () => {
    const flags = lintImageBrief({ ...CLEAN, alt_text: ' ', subject: null }, opts);
    expect(flags).toEqual(expect.arrayContaining(['alt_text is missing.', 'subject is missing.']));
  });
});

describe('imageBriefRewriteInstruction', () => {
  it('is null when clean and lists each flag otherwise', () => {
    expect(imageBriefRewriteInstruction([])).toBeNull();
    expect(imageBriefRewriteInstruction(['a.', 'b.'])).toBe('- a.\n- b.');
  });
});

describe('recentMotifs', () => {
  it('dedupes the two crops of one render by group, most recent first, capped at 3', () => {
    const rows = [
      { generation_group_id: 'g1', image_brief: { motif_key: 'vault' } },
      { generation_group_id: 'g1', image_brief: { motif_key: 'vault' } },
      { generation_group_id: 'g2', image_brief: { motif_key: 'ledger' } },
      { generation_group_id: 'g3', image_brief: null },
      { generation_group_id: 'g4', image_brief: { motif_key: 'horizon' } },
      { generation_group_id: 'g5', image_brief: { motif_key: 'survey' } },
    ];
    expect(recentMotifs(rows)).toEqual(['vault', 'ledger', 'horizon']);
  });

  it('degrades to no history on a bad read', () => {
    expect(recentMotifs(null)).toEqual([]);
    expect(recentMotifs({})).toEqual([]);
  });
});

describe('buildImageBriefPrompt', () => {
  const base = {
    story: { title: 'RBA holds', summary: 'Rates unchanged.', key_points: ['held'] },
    form: 'teach',
    postCopy: 'The RBA held rates today.',
    motifs: canon.motifs,
    recentMotifKeys: [] as string[],
  };

  it('carries the post copy and every motif key', () => {
    const p = buildImageBriefPrompt(base);
    expect(p).toContain('The RBA held rates today.');
    for (const m of canon.motifs) expect(p).toContain(`- ${m.key} (`);
    expect(p).not.toContain('Recently used motifs');
    expect(p).not.toContain('Re-brief');
  });

  it('tells the step to avoid recent motifs, and carries re-brief flags', () => {
    const p = buildImageBriefPrompt({ ...base, recentMotifKeys: ['vault', 'ledger'], rewriteInstruction: '- subject is missing.' });
    expect(p).toContain('## Recently used motifs\nvault, ledger.');
    expect(p).toContain('Re-brief');
    expect(p).toContain('- subject is missing.');
  });
});

describe('buildAltTextLexPrompt', () => {
  it('offers no disclaimer keys', () => {
    const p = buildAltTextLexPrompt('A sketch of a vault door.');
    expect(p).toContain('A sketch of a vault door.');
    expect(p).toContain('needs_disclaimer = false');
  });
});
