import { describe, it, expect } from 'vitest';
import { detectEdgarForm, splitEdgarFiling } from './edgarSections.js';

// Shaped as the HTML→markdown step emits EDGAR filings: a cover page, bold
// item headings at the start of a line, a signature block. The figures are
// illustrative; the structure is the real one.

const WEEKLY_8K = `UNITED STATES
SECURITIES AND EXCHANGE COMMISSION

**FORM 8-K**

CURRENT REPORT
Pursuant to Section 13 or 15(d) of the Securities Exchange Act of 1934

Date of Report (Date of earliest event reported): August 3, 2026

**Item 7.01 Regulation FD Disclosure.**

The Company updated its investor presentation, which states BTC Yield for the period.

**Item 8.01 Other Events.**

During the period between July 27, 2026 and August 2, 2026, the Company sold an aggregate
of 1,638 bitcoins. As of August 2, 2026, the Company held approximately 842,137 bitcoins.

**Item 9.01 Financial Statements and Exhibits.**

Exhibit 99.1 Press release dated August 3, 2026 (furnished).

**SIGNATURES**

Pursuant to the requirements of the Securities Exchange Act of 1934, the registrant has duly
caused this report to be signed. Date: June 29, 2026`;

const ANNUAL_10K = `**FORM 10-K**

TABLE OF CONTENTS

PART I
Item 1. Business 3
Item 7. Management's Discussion and Analysis 40
Item 8. Financial Statements and Supplementary Data 60

## PART I

**Item 1. Business**

We are a bitcoin treasury company. As described in Item 7, we purchased bitcoin.

**Item 1A. Risk Factors**

Our custodian may become insolvent.

## PART II

**Item 7. Management's Discussion and Analysis**

During the year we purchased 21,454 bitcoins, as discussed below.

**Item 8. Financial Statements and Supplementary Data**

Note 3. Digital Assets. The Company held 21,454 bitcoins at cost.

Item 8. Financial Statements (continued)

Note 4. Fair value.

**Item 9A. Controls and Procedures**

Disclosure controls were effective.

**SIGNATURES**

Signed.`;

const QUARTERLY_10Q = `**FORM 10-Q**

INDEX
PART I. FINANCIAL INFORMATION
Item 1. Financial Statements
PART II. OTHER INFORMATION
Item 1. Legal Proceedings

## PART I. FINANCIAL INFORMATION

**Item 1. Financial Statements**

Note 5. Bitcoin. The Company held 293.14 bitcoin at quarter end.

**Item 2. Management's Discussion and Analysis**

We added 82.32 bitcoin during the quarter.

## PART II. OTHER INFORMATION

**Item 1. Legal Proceedings**

None.

**Item 6. Exhibits**

Exhibit 31.1.

**SIGNATURES**`;

describe('detectEdgarForm', () => {
  it('reads the form from the cover page', () => {
    expect(detectEdgarForm(WEEKLY_8K, 'Weekly update')).toBe('8-K');
    expect(detectEdgarForm(QUARTERLY_10Q, '')).toBe('10-Q');
  });

  it('falls back to the registered title', () => {
    expect(detectEdgarForm('no cover text', 'Form 10-K, year ended 31 December 2025')).toBe('10-K');
  });

  it('does not split a 6-K or an exhibit filed as its own document', () => {
    expect(detectEdgarForm('FORM 6-K REPORT OF FOREIGN PRIVATE ISSUER', 'Form 6-K exhibit')).toBeNull();
    expect(detectEdgarForm('Press release', 'Sequans Completes Bitcoin Treasury Exit')).toBeNull();
  });
});

describe('splitEdgarFiling: 8-K', () => {
  const sections = splitEdgarFiling(WEEKLY_8K, 'Form 8-K — weekly update, 3 August 2026');

  it('emits one section per item', () => {
    expect(sections.map((s) => s.filingItem)).toEqual([
      '8-K Item 7.01',
      '8-K Item 8.01',
      '8-K Item 9.01',
    ]);
  });

  it('classes Item 8.01 as filed and Item 7.01 as furnished', () => {
    const byItem = Object.fromEntries(sections.map((s) => [s.filingItem, s]));
    expect(byItem['8-K Item 8.01']).toMatchObject({ sourceClass: 'exchange_announcement', isFiled: true });
    expect(byItem['8-K Item 7.01']).toMatchObject({ sourceClass: 'furnished_release', isFiled: false });
  });

  it('keeps each item to its own text', () => {
    const sale = sections.find((s) => s.filingItem === '8-K Item 8.01')!;
    expect(sale.text).toContain('1,638');
    expect(sale.text).not.toContain('BTC Yield');
  });

  it('leaves the cover page and the signature block out of every section', () => {
    // The signature date is the trap: "June 29, 2026" on an 8-K reporting
    // events to August 2. It must not reach the extractor.
    for (const section of sections) {
      expect(section.text).not.toContain('Date of earliest event reported');
      expect(section.text).not.toContain('June 29, 2026');
    }
  });
});

describe('splitEdgarFiling: 10-K', () => {
  const sections = splitEdgarFiling(ANNUAL_10K, 'Form 10-K, year ended 31 December 2025');
  const byItem = Object.fromEntries(sections.map((s) => [s.filingItem, s]));

  it('skips the table of contents', () => {
    expect(sections.map((s) => s.filingItem)).toEqual([
      '10-K Item 1',
      '10-K Item 1A',
      '10-K Item 7',
      '10-K Item 8',
      '10-K Item 9A',
    ]);
    expect(byItem['10-K Item 1'].text).toContain('bitcoin treasury company');
  });

  it('classes Item 8 as audited and everything else as narrative', () => {
    expect(byItem['10-K Item 8'].sourceClass).toBe('audited_accounts');
    expect(byItem['10-K Item 7'].sourceClass).toBe('filed_narrative');
    expect(byItem['10-K Item 1A'].sourceClass).toBe('filed_narrative');
  });

  it('does not split on a cross-reference inside a sentence', () => {
    expect(byItem['10-K Item 1'].text).toContain('As described in Item 7');
  });

  it('keeps a running header inside the item it repeats', () => {
    // Starting Item 8 at its recurrence would hand the first note to Item 7,
    // classed as narrative.
    expect(byItem['10-K Item 8'].text).toContain('Note 3');
    expect(byItem['10-K Item 8'].text).toContain('Note 4');
    expect(byItem['10-K Item 7'].text).not.toContain('Note 3');
  });
});

describe('splitEdgarFiling: 10-Q', () => {
  const sections = splitEdgarFiling(QUARTERLY_10Q, 'Form 10-Q, quarter ended 30 June 2026');
  const byItem = Object.fromEntries(sections.map((s) => [s.filingItem, s]));

  it('keys items by part, because both parts have an Item 1', () => {
    expect(sections.map((s) => s.filingItem)).toEqual([
      '10-Q Part I Item 1',
      '10-Q Part I Item 2',
      '10-Q Part II Item 1',
      '10-Q Part II Item 6',
    ]);
  });

  it('classes the financial statements as filed financials and MD&A as narrative', () => {
    expect(byItem['10-Q Part I Item 1'].sourceClass).toBe('filed_financials');
    expect(byItem['10-Q Part I Item 1'].text).toContain('293.14');
    expect(byItem['10-Q Part I Item 2'].sourceClass).toBe('filed_narrative');
    expect(byItem['10-Q Part II Item 1'].sourceClass).toBe('filed_narrative');
  });
});

describe('splitEdgarFiling: fallbacks', () => {
  it('returns nothing for a filing with no item headings, so the document is read whole', () => {
    expect(splitEdgarFiling('FORM 8-K\n\nA press release with no items.', 'Form 8-K')).toEqual([]);
  });

  it('returns nothing for a document that is not an EDGAR form', () => {
    expect(splitEdgarFiling('Sale of 8 Bitcoin Supports Advancing of Akoko PEA', 'RNS')).toEqual([]);
  });
});
