import { describe, it, expect } from 'vitest';
import { cleanNewsTitle, isGenericTitle, resolveHeadline, titleFromSlug } from './newsTitle';

const LEGAL500_URL =
  'https://www.legal500.com/developments/thought-leadership/crossing-the-pacific-key-considerations-for-us-fintechs-entering-australia/';
const LEGAL500_TITLE =
  'Piper Alderman > Australia | Legal 500 law firm profiles | News and developments';
const LEGAL500_H1 = 'Crossing the Pacific: Key considerations for US FinTechs entering Australia';

describe('cleanNewsTitle', () => {
  it('keeps the existing suffix behaviour', () => {
    expect(cleanNewsTitle('Bitcoin hits new high - The Manila Times')).toBe('Bitcoin hits new high');
    expect(cleanNewsTitle('U.S.-Iran talks resume')).toBe('U.S.-Iran talks resume');
  });

  it('decodes entities and collapses whitespace', () => {
    expect(cleanNewsTitle('Saylor&#39;s   bet &amp; the\n market')).toBe("Saylor's bet & the market");
  });

  it('strips a leading site prefix only when it is the site name', () => {
    expect(cleanNewsTitle('CoinDesk: Bitcoin tops $100k as ETFs pull in flows', { siteName: 'CoinDesk' }))
      .toBe('Bitcoin tops $100k as ETFs pull in flows');
    expect(cleanNewsTitle('Breaking: Bitcoin tops $100k as ETFs pull in flows', { siteName: 'CoinDesk' }))
      .toBe('Breaking: Bitcoin tops $100k as ETFs pull in flows');
  });

  it('keeps a headline-like last breadcrumb segment', () => {
    expect(cleanNewsTitle('Home > Markets > Bitcoin treasury firms add to holdings'))
      .toBe('Bitcoin treasury firms add to holdings');
  });

  it('leaves a breadcrumb with no headline in place so it reads as generic', () => {
    expect(cleanNewsTitle(LEGAL500_TITLE)).toBe('Piper Alderman > Australia');
    expect(isGenericTitle(LEGAL500_TITLE)).toEqual({ generic: true, reason: 'breadcrumb' });
  });
});

describe('isGenericTitle', () => {
  it('flags a source name with its tagline', () => {
    expect(isGenericTitle('TFTC — Truth for the Commoner', { sourceName: 'TFTC' }).generic).toBe(true);
  });

  it.each(['X', 'Instagram', '261113.Pdf', 'GNS Stock News', 'STRD - Strategy Inc | News', 'Just a moment...'])(
    'flags %s',
    (title) => {
      expect(isGenericTitle(title).generic).toBe(true);
    },
  );

  it('flags the hostname stem and og:site_name', () => {
    expect(isGenericTitle('Legal500', { hostname: 'www.legal500.com' }).generic).toBe(true);
    expect(isGenericTitle('DECA Bulletin', { siteName: 'DECA Bulletin' })).toEqual({ generic: true, reason: 'site_name' });
  });

  it('lets short titles with a number or ticker through', () => {
    expect(isGenericTitle('MSTR soars').generic).toBe(false);
    expect(isGenericTitle('Q3 results').generic).toBe(false);
  });

  it('passes ordinary headlines', () => {
    expect(isGenericTitle(LEGAL500_H1).generic).toBe(false);
    expect(isGenericTitle('U.S.-Iran talks resume').generic).toBe(false);
  });

  it('flags "Undercut" on length alone', () => {
    expect(isGenericTitle('Undercut')).toEqual({ generic: true, reason: 'too_short' });
  });
});

describe('titleFromSlug', () => {
  it('reads the last path segment', () => {
    expect(titleFromSlug(LEGAL500_URL)).toBe(
      'Crossing the pacific key considerations for us fintechs entering australia',
    );
  });

  it('returns null for id-like or short slugs', () => {
    expect(titleFromSlug('https://example.substack.com/p/12345')).toBeNull();
    expect(titleFromSlug('https://example.com/news/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBeNull();
    expect(titleFromSlug('https://example.com/p/undercut')).toBeNull();
    expect(titleFromSlug('not a url')).toBeNull();
  });
});

describe('resolveHeadline', () => {
  it('picks the h1 over a Legal 500 template title', () => {
    const r = resolveHeadline(
      [{ kind: 'search', title: LEGAL500_TITLE }, { kind: 'h1', title: LEGAL500_H1 }],
      { sourceName: 'legal500.com', hostname: 'www.legal500.com', url: LEGAL500_URL },
    );
    expect(r.title).toBe(LEGAL500_H1);
    expect(r.from).toBe('h1');
  });

  it('falls back to the slug when the page offers only templates', () => {
    const r = resolveHeadline(
      [{ kind: 'search', title: LEGAL500_TITLE }, { kind: 'slug', title: titleFromSlug(LEGAL500_URL) }],
      { url: LEGAL500_URL },
    );
    expect(r.from).toBe('slug');
    expect(r.rejected).toEqual([{ kind: 'search', title: 'Piper Alderman > Australia', reason: 'breadcrumb' }]);
  });

  it('lets a short og title through when it matches the search title', () => {
    const r = resolveHeadline(
      [{ kind: 'og', title: 'Undercut' }, { kind: 'search', title: 'Undercut' }],
      { sourceName: 'CheckOnChain' },
    );
    expect(r).toMatchObject({ title: 'Undercut', from: 'og' });
  });

  it('does not let a short og title through on its own', () => {
    const r = resolveHeadline([{ kind: 'og', title: 'Undercut' }], { sourceName: 'CheckOnChain' });
    expect(r).toMatchObject({ title: 'Undercut', from: 'none', needsModelHeadline: true });
  });

  it('moves on when a candidate is taken by another article', () => {
    const r = resolveHeadline(
      [
        { kind: 'search', title: 'Weekly regulatory roundup for treasurers' },
        { kind: 'anchor', title: 'ASIC updates its digital asset guidance' },
      ],
      { isTaken: (t) => t === 'Weekly regulatory roundup for treasurers' },
    );
    expect(r.title).toBe('ASIC updates its digital asset guidance');
    expect(r.from).toBe('anchor');
    expect(r.rejected[0]).toMatchObject({ kind: 'search', reason: 'taken' });
  });

  it('prefers the h1 when the og title is a truncated prefix of it', () => {
    const r = resolveHeadline([
      { kind: 'og', title: 'Crossing the Pacific: Key considerations for US…' },
      { kind: 'h1', title: LEGAL500_H1 },
    ]);
    expect(r.title).toBe(LEGAL500_H1);
    expect(r.from).toBe('h1');
    expect(r.rejected[0]).toMatchObject({ kind: 'og', reason: 'truncated' });
  });

  it('keeps the og title when the h1 is unrelated', () => {
    const r2 = resolveHeadline([
      { kind: 'og', title: 'Bitcoin treasury firms add to holdings' },
      { kind: 'h1', title: 'Newsletter sign-up and other site chrome' },
    ]);
    expect(r2).toMatchObject({ title: 'Bitcoin treasury firms add to holdings', from: 'og', rejected: [] });
  });

  it('returns the best cleaned candidate, or the url, when nothing qualifies', () => {
    expect(resolveHeadline([{ kind: 'search', title: 'X' }], { url: 'https://x.com/a/status/1' }))
      .toMatchObject({ title: 'X', from: 'none', needsModelHeadline: true });
    expect(resolveHeadline([], { url: 'https://x.com/a/status/1' }))
      .toMatchObject({ title: 'https://x.com/a/status/1', from: 'none' });
  });
});
