import { describe, expect, it } from 'vitest';
import {
  BROKEN_OBJECT_TERMS,
  isBrokenConcept,
  lintImageBrief,
  readStoredBrief,
  type ImageConcept,
} from './brandVisual.js';
import {
  headlineAltText,
  lintHeadline,
  lintKicker,
  numberWordsToDigits,
  stripHeadlineFromAlt,
  typographicQuotes,
} from './headline.js';

const POST =
  'The RBA held at 4.35%, a split vote. Consumer confidence just hit −15, and the MSCI decision lands in 2044 days. Bitcoin treasuries keep buying: $245M this quarter.';

describe('lintHeadline', () => {
  it('passes the approved examples', () => {
    for (const h of ['Discipline beats conviction.', 'Direction isn’t seaworthiness.', 'Who moved the measuring stick?']) {
      expect(lintHeadline(h, POST)).toEqual({ ok: true, flags: [] });
    }
  });

  it('flags length: too few words, too many words, too many characters', () => {
    expect(lintHeadline('Discipline.', POST).flags.join()).toMatch(/2 to 7 words/);
    expect(lintHeadline('This one runs on and on far past seven words.', POST).flags.join()).toMatch(/2 to 7 words/);
    expect(lintHeadline('Extraordinarily disproportionate counterintuitive misunderstandings.', POST).flags.join()).toMatch(
      /48 characters/,
    );
  });

  it('flags an exclamation mark and a missing ending', () => {
    expect(lintHeadline('Discipline beats conviction!', POST).flags).toContain('No exclamation marks.');
    expect(lintHeadline('Discipline beats conviction', POST).flags).toContain('End with a full stop or a question mark.');
  });

  it('flags a lower-case start', () => {
    expect(lintHeadline('discipline beats conviction.', POST).flags).toContain('Start with a capital letter.');
  });

  it('allows acronyms and flags shouting', () => {
    expect(lintHeadline('The RBA split.', POST).ok).toBe(true);
    expect(lintHeadline('MSCI blinks first.', POST).ok).toBe(true);
    expect(lintHeadline('Rates are UNCHANGED.', POST).flags.join()).toMatch(/sentence case, not capitals/);
  });

  it('flags Title Case but not proper nouns the post capitalises', () => {
    expect(lintHeadline('Discipline Beats Conviction.', POST).flags).toContain('Use sentence case, not Title Case.');
    expect(lintHeadline('Treasuries keep buying Bitcoin.', POST).ok).toBe(true);
    expect(lintHeadline('Consumer Confidence Falls.', POST).flags).toContain('Use sentence case, not Title Case.');
  });

  it('flags words to avoid at word boundaries only', () => {
    expect(lintHeadline('The best hedge.', POST).flags.join()).toMatch(/Avoid these words: best/);
    expect(lintHeadline('You should buy.', POST).flags.join()).toMatch(/should/);
    expect(lintHeadline('No financial adviser here.', POST).flags.join()).toMatch(/financial adviser/);
    expect(lintHeadline('Patience will bestow.', POST).ok).toBe(true);
    expect(lintHeadline('A hedge, not a stop.', POST).ok).toBe(true);
  });

  it('flags a figure that is not in the post', () => {
    expect(lintHeadline('Confidence just hit −20.', POST).flags).toContain('Figure not in the post: −20.');
    expect(lintHeadline('Rates held at 4.5%.', POST).flags.join()).toMatch(/Figure not in the post: 4.5/);
    // 15 inside 150 is not 15.
    expect(lintHeadline('Only 150 left.', 'There are 1500 left.').flags.join()).toMatch(/150/);
  });

  it('passes figures from the post, normalising minus signs, thin spaces and dollars', () => {
    expect(lintHeadline('Confidence just hit −15.', POST).ok).toBe(true);
    expect(lintHeadline('Confidence just hit -15.', POST).ok).toBe(true);
    expect(lintHeadline('Rates held at 4.35%.', POST).ok).toBe(true);
    expect(lintHeadline('$245M this quarter.', POST).ok).toBe(true);
    expect(lintHeadline('Still 2044 days.', POST).ok).toBe(true);
    expect(lintHeadline('A $1 000 gap.', 'The gap is $1000.').ok).toBe(true);
  });
});

describe('lintHeadline: figures first, spelled-out numbers (2026-11-21 run)', () => {
  const NETWORK = '$1.3 trillion sitting there for 18 years. Nobody has forged a block. The Bitcoin network keeps running.';

  it('checks the capital on the first letter, so a headline may open on a figure', () => {
    expect(lintHeadline('$1.3 trillion. No reversal.', NETWORK)).toEqual({ ok: true, flags: [] });
    expect(lintHeadline('18 years. No forgery.', NETWORK).ok).toBe(true);
    expect(lintHeadline('−15 and falling.', POST).ok).toBe(true);
    expect(lintHeadline('"Safe" moved.', POST).flags).not.toContain('Start with a capital letter.');
  });

  it('still flags a lowercase first letter behind a quote', () => {
    expect(lintHeadline('"safe" isn\'t safe.', POST).flags).toContain('Start with a capital letter.');
  });

  it('a figure-first headline is still held to the figure check', () => {
    expect(lintHeadline('$2.1 trillion. No reversal.', NETWORK).flags.join()).toMatch(/Figure not in the post: \$2.1/);
  });

  it('matches a spelled-out number against digits in the post', () => {
    expect(lintHeadline('Almost eighteen years. No forgery.', NETWORK)).toEqual({ ok: true, flags: [] });
  });

  it('flags a spelled-out number the post does not have', () => {
    expect(lintHeadline('Twenty years. No forgery.', NETWORK).flags).toContain('Figure not in the post: Twenty.');
  });

  it('matches digits in the headline against words in the post', () => {
    expect(lintHeadline('18 years. No forgery.', 'Eighteen years and no forgery.').ok).toBe(true);
  });
});

describe('numberWordsToDigits', () => {
  it('normalises units, tens, hyphenated forms and scales', () => {
    expect(numberWordsToDigits('twenty-one')).toBe('21');
    expect(numberWordsToDigits('Eighteen years')).toBe('18 years');
    expect(numberWordsToDigits('two hundred and five')).toBe('205');
    expect(numberWordsToDigits('three thousand')).toBe('3000');
    expect(numberWordsToDigits('a dozen')).toBe('a 12');
    expect(numberWordsToDigits('eighteen million')).toBe('18 million');
  });

  it('leaves a scale word after digits alone', () => {
    expect(numberWordsToDigits('$1.3 trillion')).toBe('$1.3 trillion');
    expect(numberWordsToDigits('18 million')).toBe('18 million');
  });

  it('only matches whole words', () => {
    expect(numberWordsToDigits('someone often tends')).toBe('someone often tends');
  });
});

describe('lintKicker', () => {
  it('passes a plain-English subject', () => {
    for (const k of ['Bitcoin security', 'Business confidence', 'Interest rates', 'Digital asset rules', 'Self-custody', 'Macro outlook']) {
      expect(lintKicker(k)).toEqual({ ok: true, flags: [] });
    }
  });

  it('fails an internal category on its own', () => {
    expect(lintKicker('Macro').flags).toContain('Name the subject, not an internal category.');
    for (const k of ['regulatory', 'Corporate', 'INTERNATIONAL', 'general']) expect(lintKicker(k).ok).toBe(false);
  });

  it('fails more than three words, or more than 24 characters', () => {
    expect(lintKicker('Bitcoin network security budget').flags.join()).toMatch(/1 to 3 words; this has 4/);
    expect(lintKicker('Extraordinarily disproportionate').flags.join()).toMatch(/24 characters/);
  });

  it('fails digits and symbols', () => {
    expect(lintKicker('2024 halving').flags).toContain('Use letters, spaces and hyphens only.');
    expect(lintKicker('Rates & wages').flags).toContain('Use letters, spaces and hyphens only.');
    expect(lintKicker('Rates.').ok).toBe(false);
  });

  it('fails prohibited terms', () => {
    expect(lintKicker('Crypto rules').flags.join()).toMatch(/Avoid these words: crypto/);
    expect(lintKicker('Best practice').flags.join()).toMatch(/best/);
  });

  it('fails the company name in any register', () => {
    expect(lintKicker('BTS view').flags).toContain('Name the subject, not the company.');
    expect(lintKicker('Treasury Solutions').ok).toBe(false);
  });

  it('fails an empty kicker', () => {
    expect(lintKicker('  ').ok).toBe(false);
  });
});

describe('typographicQuotes', () => {
  it('converts straight quotes and apostrophes', () => {
    expect(typographicQuotes(`Direction isn't seaworthiness.`)).toBe('Direction isn’t seaworthiness.');
    expect(typographicQuotes(`The word "safe" moved.`)).toBe('The word “safe” moved.');
    expect(typographicQuotes(`'Safe' moved.`)).toBe('‘Safe’ moved.');
  });
});

describe('headlineAltText', () => {
  it('puts the headline first and replaces an earlier one', () => {
    const alt = headlineAltText('Discipline beats conviction.', 'A tree with shallow roots.');
    expect(alt).toBe('“Discipline beats conviction.” — A tree with shallow roots.');
    expect(headlineAltText('New words.', alt)).toBe('“New words.” — A tree with shallow roots.');
    expect(headlineAltText(null, alt)).toBe('A tree with shallow roots.');
    expect(stripHeadlineFromAlt('A plain description.')).toBe('A plain description.');
  });
});

const concept = (over: Partial<ImageConcept>): ImageConcept => ({
  tension: 't',
  symbol: 'a lighthouse',
  twist: 'one gold beam',
  subject: 'a lighthouse throwing one gold beam',
  layout: 'offset_left',
  alt_text: 'a lighthouse',
  ...over,
});

describe('broken objects', () => {
  const opts = { layouts: [{ key: 'offset_left', label: 'Offset', description: '', is_active: true }], prohibitedTerms: [] };

  it('lists the terms', () => {
    expect(BROKEN_OBJECT_TERMS).toContain('snapped');
    expect(isBrokenConcept(concept({ twist: 'the blade snapped in two' }))).toBe(true);
    expect(isBrokenConcept(concept({}))).toBe(false);
  });

  it('keeps the first broken concept and flags the second and third', () => {
    const brief = {
      skip: false,
      skip_reason: null,
      hook: 'measuring stick',
      headlines: [],
      kicker: '',
      concepts: [
        concept({ symbol: 'a dipstick', twist: 'snapped at the line', subject: 'a snapped dipstick' }),
        concept({ symbol: 'a lighthouse' }),
        concept({ symbol: 'a tape measure', twist: 'rusted through', subject: 'a rusted tape measure' }),
        concept({ symbol: 'a hose', twist: 'leaking at the join', subject: 'a garden hose leaking' }),
      ],
    };
    const lint = lintImageBrief(brief, opts);
    expect(lint.clean.map((c) => c.symbol)).toEqual(['a dipstick', 'a lighthouse']);
    expect(lint.flags).toHaveLength(2);
    expect(lint.flags[0]).toMatch(/^Concept 3: a second broken object/);
    expect(lint.flags[1]).toMatch(/^Concept 4: a second broken object/);
  });
});

describe('readStoredBrief headline', () => {
  it('reads a row with a headline', () => {
    const brief = readStoredBrief({ ...concept({}), hook: 'the hook', headline: 'Discipline beats conviction.' });
    expect(brief?.headline).toBe('Discipline beats conviction.');
    expect(brief?.hook).toBe('the hook');
  });

  it('reads a row without one as null', () => {
    expect(readStoredBrief({ ...concept({}), hook: 'the hook' })?.headline).toBeNull();
    expect(readStoredBrief({ motif_key: 'x', subject: 's' })?.headline).toBeNull();
  });
});
