import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abstractFromInvertedIndex, getWork, listWorks, normaliseDoi, OpenAlexError, shortOpenAlexId,
} from './openalex.js';
import {
  depositedLicences, getCrossrefWork, isNotice, isPostedContent, plainAbstract, publishedVersionDois,
  updatesAgainst, type CrossrefWork,
} from './crossref.js';
import { fromEprints, fromOpenAlex, fromUrl } from './licences.js';
import { eprintsExportUrl, parseEprintsExport } from './repository.js';

// Fixtures here are built by hand from the documented response shapes of
// OpenAlex, Crossref and EPrints, not recorded from the live services: this
// session's network policy does not reach them. The golden-set eval
// (evals/library-papers.eval.ts) is what runs against the real APIs.

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('openalex', () => {
  beforeEach(() => { process.env['OPENALEX_API_KEY'] = 'test-key'; });
  afterEach(() => { delete process.env['OPENALEX_API_KEY']; });

  it('normalises DOIs and OpenAlex ids', () => {
    expect(normaliseDoi('https://doi.org/10.5195/LEDGER.2018.127')).toBe('10.5195/ledger.2018.127');
    expect(normaliseDoi('10.20944/preprints202108.0555.v1')).toBe('10.20944/preprints202108.0555.v1');
    expect(normaliseDoi('W2766522683')).toBeNull();
    expect(shortOpenAlexId('https://openalex.org/W2766522683')).toBe('W2766522683');
    expect(shortOpenAlexId('nonsense')).toBeNull();
  });

  it('rebuilds an abstract from the inverted index in word order', () => {
    expect(abstractFromInvertedIndex({ We: [0], bitcoin: [2], study: [1] })).toBe('We study bitcoin');
    expect(abstractFromInvertedIndex(null)).toBeNull();
  });

  it('looks a work up by DOI with the key on the request', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'https://openalex.org/W1' }));
    const work = await getWork('https://doi.org/10.5195/ledger.2018.127', fetchImpl as unknown as typeof fetch);
    expect(work?.id).toBe('https://openalex.org/W1');
    const url = (fetchImpl.mock.calls[0] as unknown[])[0] as URL;
    expect(url.pathname).toBe('/works/doi:10.5195/ledger.2018.127');
    expect(url.searchParams.get('api_key')).toBe('test-key');
    expect(url.searchParams.get('select')).toContain('abstract_inverted_index');
  });

  it('returns null for a work OpenAlex does not have', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    expect(await getWork('W9', fetchImpl as unknown as typeof fetch)).toBeNull();
  });

  it('refuses to call without a key', async () => {
    delete process.env['OPENALEX_API_KEY'];
    await expect(getWork('W1', vi.fn() as unknown as typeof fetch)).rejects.toThrow('OPENALEX_API_KEY is not set');
  });

  it('pages a filtered list by cursor', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ meta: { next_cursor: 'abc', count: 2 }, results: [{ id: 'W1' }, { id: 'W2' }] }));
    const page = await listWorks('title_and_abstract.search:bitcoin', '*', fetchImpl as unknown as typeof fetch);
    expect(page).toEqual({ results: [{ id: 'W1' }, { id: 'W2' }], nextCursor: 'abc', count: 2 });
    const url = (fetchImpl.mock.calls[0] as unknown[])[0] as URL;
    expect(url.searchParams.get('filter')).toBe('title_and_abstract.search:bitcoin');
    expect(url.searchParams.get('per-page')).toBe('200');
  });

  it('throws on a server error rather than reading it as empty', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 503 }));
    await expect(listWorks('x', '*', fetchImpl as unknown as typeof fetch)).rejects.toBeInstanceOf(OpenAlexError);
  });
});

describe('crossref', () => {
  const work: CrossrefWork = {
    DOI: '10.1093/restud/rdab014',
    type: 'journal-article',
    license: [
      { URL: 'https://creativecommons.org/licenses/by-nc/4.0/', 'content-version': 'vor', start: { 'date-parts': [[2021, 3, 13]] } },
      { URL: 'https://academic.oup.com/journals/pages/open_access/funder_policies/chorus/standard_publication_model', 'content-version': 'am', start: { 'date-parts': [[2022, 3, 13]] }, 'delay-in-days': 365 },
      { URL: 'https://www.springer.com/tdm', 'content-version': 'tdm' },
      { URL: 'https://creativecommons.org/licenses/by/4.0/', 'content-version': 'vor', start: { 'date-parts': [[2099, 1, 1]] } },
    ],
    'updated-by': [
      { DOI: '10.1016/J.IRFA.2026.105078', type: 'retraction', source: 'retraction-watch' },
      { DOI: '10.1000/c', type: 'correction' },
      { DOI: '10.1000/e', type: 'expression_of_concern' },
      { DOI: '10.1000/n', type: 'new_version' },
    ],
    relation: { 'is-preprint-of': [{ id: '10.3390/JRFM14090427', 'id-type': 'doi' }] },
    abstract: '<jats:title>Abstract</jats:title><jats:p>We find <jats:italic>bitcoin</jats:italic> returns.</jats:p>',
  };

  it('reads the version-of-record licence in force, never the TDM one', () => {
    expect(depositedLicences(work, 'vor', new Date('2026-10-19'))).toEqual(['https://creativecommons.org/licenses/by-nc/4.0/']);
    expect(depositedLicences(work, 'vor', new Date('2021-01-01'))).toEqual([]);
  });

  it('honours delay-in-days on an accepted-manuscript licence', () => {
    expect(depositedLicences(work, 'am', new Date('2022-06-01'))).toEqual([]);
    expect(depositedLicences(work, 'am', new Date('2023-06-01'))).toHaveLength(1);
  });

  it('reads notices against the work, and ignores other update types', () => {
    expect(updatesAgainst(work)).toEqual([
      { kind: 'retracted', noticeDoi: '10.1016/j.irfa.2026.105078', source: 'crossref' },
      { kind: 'corrected', noticeDoi: '10.1000/c', source: 'crossref' },
      { kind: 'concern_raised', noticeDoi: '10.1000/e', source: 'crossref' },
    ]);
    expect(isNotice(work)).toBe(false);
    expect(isNotice({ DOI: 'x', 'update-to': [{ DOI: 'y', type: 'retraction' }] })).toBe(true);
  });

  it('reads preprint relations and posted-content', () => {
    expect(publishedVersionDois(work)).toEqual(['10.3390/jrfm14090427']);
    expect(isPostedContent({ DOI: 'x', type: 'posted-content' })).toBe(true);
    expect(isPostedContent(work)).toBe(false);
  });

  it('strips JATS from an abstract', () => {
    expect(plainAbstract(work)).toBe('We find bitcoin returns.');
  });

  it('returns null for a DOI Crossref does not have', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 404 }));
    expect(await getCrossrefWork('10.1000/x', fetchImpl as unknown as typeof fetch)).toBeNull();
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['User-Agent']).toContain('mailto:');
  });
});

describe('licences', () => {
  it('maps OpenAlex codes, keeping known ones and folding the rest to other-oa', () => {
    expect(fromOpenAlex('cc-by')).toBe('cc-by');
    expect(fromOpenAlex('implied-oa')).toBe('implied-oa');
    expect(fromOpenAlex('mit')).toBe('other-oa');
    expect(fromOpenAlex(null)).toBeNull();
  });

  it('maps licence URLs across versions and ports', () => {
    expect(fromUrl('http://creativecommons.org/licenses/by/3.0/')).toBe('cc-by');
    expect(fromUrl('https://creativecommons.org/licenses/by-nc-nd/4.0/legalcode')).toBe('cc-by-nc-nd');
    expect(fromUrl('https://creativecommons.org/licenses/by/2.5/au/')).toBe('cc-by');
    expect(fromUrl('https://creativecommons.org/publicdomain/zero/1.0/')).toBe('cc0');
    expect(fromUrl('http://arxiv.org/licenses/nonexclusive-distrib/1.0/')).toBe('arxiv-default');
    expect(fromUrl('https://www.elsevier.com/open-access/userlicense/1.0/')).toBe('publisher-specific-oa');
    expect(fromUrl('https://example.org/our-terms')).toBe('other-oa');
  });

  it('maps EPrints licence values, treating a bare accepted-manuscript deposit as unlicensed', () => {
    expect(fromEprints('cc_by_nc_nd_4')).toBe('cc-by-nc-nd');
    expect(fromEprints('cc_by_4')).toBe('cc-by');
    expect(fromEprints('cc_by_sa')).toBe('cc-by-sa');
    expect(fromEprints('accepted_manuscript')).toBeNull();
  });
});

describe('repository', () => {
  it('finds the EPrints export for bare and /id/eprint/ landing pages', () => {
    expect(eprintsExportUrl('https://eprints.soton.ac.uk/447739')).toBe(
      'https://eprints.soton.ac.uk/cgi/export/eprint/447739/JSON/eprint-447739.js',
    );
    expect(eprintsExportUrl('https://researchonline.lse.ac.uk/id/eprint/100409/')).toBe(
      'https://researchonline.lse.ac.uk/cgi/export/eprint/100409/JSON/eprint-100409.js',
    );
    expect(eprintsExportUrl('https://research.birmingham.ac.uk/en/publications/x/')).toBeNull();
  });

  const asOf = new Date('2026-10-18');

  it('takes the best public file (gs-22: a public accepted manuscript, no CC licence)', () => {
    expect(parseEprintsExport({ documents: [{ content: 'accepted', security: 'public', license: 'accepted_manuscript' }] }, asOf))
      .toMatchObject({ version: 'acceptedVersion', isOa: true, licence: null });
  });

  it('reads the licence of the public file (gs-23: CC BY-NC-ND accepted manuscript)', () => {
    expect(parseEprintsExport({ documents: [
      { content: 'published', security: 'staffonly' },
      { content: 'accepted', security: 'public', license: 'cc_by_nc_nd_4' },
    ] }, asOf)).toMatchObject({ version: 'acceptedVersion', isOa: true, licence: 'cc-by-nc-nd' });
  });

  it('skips an embargoed file', () => {
    expect(parseEprintsExport({ documents: [{ content: 'accepted', security: 'public', date_embargo: '2027-01-01' }] }, asOf))
      .toMatchObject({ isOa: false, version: null });
  });

  it('returns null when the payload is not an EPrints export', () => {
    expect(parseEprintsExport({ hello: 'world' }, asOf)).toBeNull();
  });
});
