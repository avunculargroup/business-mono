import { describe, it, expect } from 'vitest';
import { admitUnits, sectionsFor, unitsFor, type ReadableDocument } from './readingUnits.js';

const EIGHT_K = `FORM 8-K

**Item 7.01 Regulation FD Disclosure.**

Presentation furnished.

**Item 8.01 Other Events.**

The Company sold 1,638 bitcoins.

SIGNATURES`;

const filing: ReadableDocument = {
  id: 'doc-8k',
  title: 'Form 8-K — weekly update',
  text: EIGHT_K,
  sourceClass: 'exchange_announcement',
  venue: 'sec',
};

const LEDGER = new Set(['regulated_disclosure', 'exchange_announcement', 'audited_accounts', 'filed_financials']);

describe('sectionsFor', () => {
  it('splits a filing registered at the SEC', () => {
    expect(sectionsFor(filing).map((s) => s.filingItem)).toEqual(['8-K Item 7.01', '8-K Item 8.01']);
  });

  it('never splits a document from anywhere else, whatever its text says', () => {
    // A secondary source split into "filed" sections would launder its class.
    const article = { ...filing, venue: 'web', sourceClass: 'secondary' };
    expect(sectionsFor(article)).toEqual([]);
  });
});

describe('unitsFor', () => {
  it('reads an unsplit document whole, under its own class', () => {
    const rns = { ...filing, venue: 'lse', text: 'Sale of 8 bitcoin.' };
    expect(unitsFor(rns, [], [])).toEqual([
      expect.objectContaining({ documentId: 'doc-8k', sectionId: null, sourceClass: 'exchange_announcement' }),
    ]);
  });

  it('cites the stored section, and takes its stored class over the splitter', () => {
    const sections = sectionsFor(filing);
    const units = unitsFor(filing, sections, [
      { id: 'sec-701', filing_item: '8-K Item 7.01', source_class: 'furnished_release' },
      // Classified by hand as something the splitter would not have chosen.
      { id: 'sec-801', filing_item: '8-K Item 8.01', source_class: 'regulated_disclosure' },
    ]);

    expect(units.map((u) => [u.sectionId, u.sourceClass])).toEqual([
      ['sec-701', 'furnished_release'],
      ['sec-801', 'regulated_disclosure'],
    ]);
    expect(units[1].text).toContain('1,638');
  });

  it('does not read a section that did not store', () => {
    expect(unitsFor(filing, sectionsFor(filing), [])).toEqual([]);
  });
});

describe('admitUnits', () => {
  it('keeps furnished, narrative and secondary text away from the ledger extractor', () => {
    const units = unitsFor(filing, sectionsFor(filing), [
      { id: 'sec-701', filing_item: '8-K Item 7.01', source_class: 'furnished_release' },
      { id: 'sec-801', filing_item: '8-K Item 8.01', source_class: 'exchange_announcement' },
    ]);
    const news = unitsFor({ ...filing, id: 'doc-news', venue: 'web', sourceClass: 'secondary' }, [], []);

    const { admitted, skipped } = admitUnits([...units, ...news], LEDGER);

    expect(admitted.map((u) => u.sectionId)).toEqual(['sec-801']);
    expect(skipped.map((u) => u.sourceClass).sort()).toEqual(['furnished_release', 'secondary']);
  });
});
