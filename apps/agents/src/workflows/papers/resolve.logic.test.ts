import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeAccessTier } from './accessTier.js';
import { classifyPeerReview, scoreRelevance, tierForBand } from './classify.js';
import type { CrossrefWork } from './crossref.js';
import { arxivIdFrom, isPreprintHost, normaliseWork } from './normalise.js';
import type { OpenAlexWork } from './openalex.js';
import { reconcile } from './reconcile.js';
import type { RepositoryRecord } from './repository.js';
import type { Location, PeerReviewStatus } from './types.js';

// OpenAlex works below are hand-built in the documented shape, modelled on the
// golden-set entries named in each test. They are not recorded responses.

const asOf = new Date('2026-10-18');
const noRepos = new Map<string, RepositoryRecord | null>();

function work(over: Partial<OpenAlexWork>): OpenAlexWork {
  return {
    id: 'https://openalex.org/W1',
    doi: 'https://doi.org/10.1000/paper.1',
    title: 'Bitcoin as a treasury asset',
    publication_year: 2021,
    type: 'article',
    primary_location: { source: { id: 'https://openalex.org/S1', display_name: 'A Journal', type: 'journal' } },
    locations: [],
    ...over,
  };
}

function only<T>(xs: T[], pred: (x: T) => boolean): T {
  const hit = xs.filter(pred);
  expect(hit).toHaveLength(1);
  return hit[0];
}

describe('normaliseWork', () => {
  it('maps identifiers, venue, locations, authors and the abstract', () => {
    const n = normaliseWork(work({
      authorships: [{ author: { id: 'https://openalex.org/A5', display_name: 'S. Nakamoto', orcid: 'https://orcid.org/0000-0002-1825-0097' }, raw_affiliation_strings: ['P2P Foundation'] }],
      abstract_inverted_index: { We: [0], bitcoin: [2], study: [1] },
      locations: [
        { is_oa: true, landing_page_url: 'https://ledger.pitt.edu/1', pdf_url: 'https://ledger.pitt.edu/1.pdf', license: 'cc-by', version: 'publishedVersion', source: { display_name: 'Ledger', type: 'journal' } },
        { is_oa: false, landing_page_url: 'https://ledger.pitt.edu/1', license: null, version: null, source: { display_name: 'Ledger', type: 'journal' } },
        { is_oa: true, landing_page_url: 'https://arxiv.org/abs/2001.00001v3', version: 'acceptedVersion', license: 'other-oa', source: { display_name: 'arXiv', type: 'repository' } },
      ],
      awards: [{ funder_display_name: 'ARC', funder_award_id: 'DP1' }],
    }));
    expect(n.identifiers).toEqual({ doi: '10.1000/paper.1', openalexId: 'W1', arxivId: '2001.00001', handle: null, sourceUrl: null });
    expect(n.venue).toMatchObject({ openalexSourceId: 'S1', name: 'A Journal', venueType: 'journal' });
    expect(n.locations).toHaveLength(2); // the closed duplicate of the Ledger URL folds into the open one
    expect(only(n.locations, (l) => l.hostType === 'publisher')).toMatchObject({ isOa: true, licence: 'cc-by', pdfUrl: 'https://ledger.pitt.edu/1.pdf' });
    expect(only(n.locations, (l) => l.hostType === 'preprint_server')).toMatchObject({ version: 'acceptedVersion' });
    expect(n.authors).toEqual([{ openalexAuthorId: 'A5', orcid: '0000-0002-1825-0097', displayName: 'S. Nakamoto', position: 1, rawAffiliation: 'P2P Foundation', isCorresponding: false }]);
    expect(n.abstract).toBe('We study bitcoin');
    expect(n.funders).toEqual([{ name: 'ARC', awardId: 'DP1', source: 'openalex' }]);
  });

  it('keeps a publisher copy a publisher copy whatever host its PDF is on (gs-25)', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: 'https://doi.org/10.1093/rfs/hhaa113', pdf_url: 'http://www.nber.org/papers/w24877.pdf', version: 'publishedVersion', license: null, source: { display_name: 'Review of Financial Studies', type: 'journal' } }],
    }));
    expect(n.locations[0]).toMatchObject({ hostType: 'publisher', version: 'publishedVersion', isOa: true });
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: noRepos, asOf });
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('read_at_source');
  });

  it('rule 3: the repository\'s record URL replaces one OpenAlex garbled (gs-22)', () => {
    const garbled = 'http://doi.org/10.1016/j.frl.2021.102016>).';
    const n = normaliseWork(work({
      locations: [{ is_oa: false, landing_page_url: garbled, version: 'acceptedVersion', source: { id: 'https://openalex.org/S4306401019', display_name: 'ePrints Soton', type: 'repository' } }],
    }));
    expect(n.locations[0].sourceId).toBe('S4306401019');
    const repos = new Map([[garbled, { version: 'acceptedVersion' as const, isOa: true, licence: null, recordUrl: 'https://eprints.soton.ac.uk/id/eprint/447739', evidence: 'found by DOI search' }]]);
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: repos, asOf });
    expect(r.locations[0]).toMatchObject({ landingUrl: 'https://eprints.soton.ac.uk/id/eprint/447739', verifiedAtHost: true, isOa: true });
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('read_at_source');
  });

  it('types a repository copy with a doi.org landing page and a preprint-host PDF as a preprint (gs-37, live shape)', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: 'https://doi.org/10.20944/preprints202108.0555.v1', pdf_url: 'https://www.preprints.org/manuscript/202108.0555/v1/download', version: 'acceptedVersion', license: 'cc-by', source: { display_name: 'Preprints.org', type: 'repository' } }],
    }));
    expect(n.locations[0]).toMatchObject({ hostType: 'preprint_server', doi: '10.20944/preprints202108.0555.v1' });
  });

  it('recognises preprint hosts and arXiv ids', () => {
    expect(isPreprintHost('https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1')).toBe(true);
    expect(isPreprintHost('https://www.preprints.org/manuscript/202108.0555')).toBe(true);
    expect(isPreprintHost('https://eprints.soton.ac.uk/1')).toBe(false);
    expect(arxivIdFrom('10.48550/arxiv.2101.00001', [])).toBe('2101.00001');
    expect(arxivIdFrom(null, ['https://arxiv.org/pdf/2101.00001v2.pdf'])).toBe('2101.00001');
  });
});

describe('reconcile', () => {
  it('rule 3: a repository copy counts only once confirmed, and the repository wins (gs-22)', () => {
    const n = normaliseWork(work({
      locations: [
        { is_oa: false, landing_page_url: 'https://doi.org/10.1000/paper.1', version: 'publishedVersion', source: { display_name: 'A Journal', type: 'journal' } },
        { is_oa: false, landing_page_url: 'https://eprints.soton.ac.uk/447739', version: 'acceptedVersion', source: { display_name: 'Southampton', type: 'repository' } },
      ],
    }));
    const unconfirmed = reconcile({ work: n, requestedDoi: null, crossref: null, repository: noRepos, asOf });
    expect(computeAccessTier(unconfirmed.locations, 'peer_reviewed').tier).toBe('metadata_only');

    const repos = new Map([['https://eprints.soton.ac.uk/447739', { version: 'acceptedVersion' as const, isOa: true, licence: null, recordUrl: null, evidence: 'content: accepted, security: public' }]]);
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: repos, asOf });
    expect(only(r.locations, (l) => l.hostType === 'repository')).toMatchObject({ isOa: true, verifiedAtHost: true, reportedBy: 'repository' });
    expect(r.events).toEqual([expect.objectContaining({ rule: 3 })]);
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('read_at_source');
  });

  it('rule 3: an unconfirmed repository copy lifts nothing, even when OpenAlex says it is open', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: 'https://repo.example.org/handle/1', version: 'acceptedVersion', license: 'cc-by', source: { display_name: 'Some repository', type: 'repository' } }],
    }));
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: new Map([['https://repo.example.org/handle/1', null]]), asOf });
    expect(r.locations[0]).toMatchObject({ isOa: true, verifiedAtHost: false });
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('metadata_only');
  });

  it('rule 3 runs before the SSRN rule, and a confirmed copy drops a DOI read off a garbled URL (first live backfill)', () => {
    // The row the database refused: a Southampton accepted manuscript whose OpenAlex
    // landing URL is "http://doi.org/10.2139/ssrn.3550842>).", with the PDF on ePrints.
    const garbled = 'http://doi.org/10.2139/ssrn.3550842>).';
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: garbled, pdf_url: 'https://eprints.soton.ac.uk/439058/1/The_impact.pdf', version: 'acceptedVersion', source: { id: 'https://openalex.org/S4306401019', display_name: 'ePrints Soton', type: 'repository' } }],
    }));
    expect(n.locations[0].doi).toBe('10.2139/ssrn.3550842');
    const repos = new Map([[garbled, { version: 'acceptedVersion' as const, isOa: true, licence: null, recordUrl: 'https://eprints.soton.ac.uk/id/eprint/439058', evidence: 'content: accepted' }]]);
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: repos, asOf });
    expect(r.locations[0]).toMatchObject({
      landingUrl: 'https://eprints.soton.ac.uk/id/eprint/439058', doi: null, version: 'acceptedVersion', verifiedAtHost: true,
    });
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('read_at_source');
  });

  it('rule 2 still has the last word on a real SSRN copy a repository record describes', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1', version: 'publishedVersion', source: { display_name: 'SSRN', type: 'repository' } }],
    }));
    const repos = new Map([['https://papers.ssrn.com/sol3/papers.cfm?abstract_id=1', { version: 'publishedVersion' as const, isOa: true, licence: null, recordUrl: null, evidence: 'x' }]]);
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: repos, asOf });
    expect(r.locations[0].version).toBe('submittedVersion');
  });

  it('rule 3: the repository corrects the version too (gs-23)', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: true, landing_page_url: 'https://eprints.soton.ac.uk/425053', version: 'submittedVersion', source: { display_name: 'Southampton', type: 'repository' } }],
    }));
    const repos = new Map([['https://eprints.soton.ac.uk/425053', { version: 'acceptedVersion' as const, isOa: true, licence: 'cc-by-nc-nd', recordUrl: null, evidence: 'content: accepted' }]]);
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: repos, asOf });
    expect(computeAccessTier(r.locations, 'peer_reviewed')).toEqual({ tier: 'read_at_source', licence: 'cc-by-nc-nd' });
  });

  it('rule 2: SSRN is never the published version (gs-24, gs-35)', () => {
    const n = normaliseWork(work({
      locations: [
        { is_oa: false, landing_page_url: 'https://doi.org/10.1000/paper.1', version: 'publishedVersion', source: { display_name: 'A Journal', type: 'journal' } },
        { is_oa: true, landing_page_url: 'https://doi.org/10.2139/ssrn.3171204', version: 'publishedVersion', source: { display_name: 'SSRN', type: 'repository' } },
      ],
    }));
    const r = reconcile({ work: n, requestedDoi: null, crossref: null, repository: noRepos, asOf });
    expect(only(r.locations, (l) => l.doi === '10.2139/ssrn.3171204').version).toBe('submittedVersion');
    expect(r.events.map((e) => e.rule)).toEqual([2]);
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('metadata_only');
  });

  it('rule 1: the publisher\'s CC BY-NC deposit for the VoR makes it read_at_source (gs-28)', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: false, landing_page_url: 'https://academic.oup.com/x', version: 'publishedVersion', source: { display_name: 'RES', type: 'journal' } }],
    }));
    const crossref: CrossrefWork = { DOI: '10.1000/paper.1', type: 'journal-article', license: [{ URL: 'https://creativecommons.org/licenses/by-nc/4.0/', 'content-version': 'vor', start: { 'date-parts': [[2021, 3, 13]] } }] };
    const r = reconcile({ work: n, requestedDoi: null, crossref, repository: noRepos, asOf });
    expect(only(r.locations, (l) => l.hostType === 'publisher')).toMatchObject({ licence: 'cc-by-nc', isOa: true, landingUrl: 'https://academic.oup.com/x' });
    expect(r.events.map((e) => e.rule)).toEqual([1]);
    expect(computeAccessTier(r.locations, 'peer_reviewed')).toEqual({ tier: 'read_at_source', licence: 'cc-by-nc' });
  });

  it('rule 1: a CC BY VoR deposit with no OpenAlex copy adds one at the DOI (gs-36)', () => {
    const n = normaliseWork(work({ locations: [] }));
    const crossref: CrossrefWork = { DOI: '10.1000/paper.1', license: [{ URL: 'http://creativecommons.org/licenses/by/4.0/', 'content-version': 'vor' }] };
    const r = reconcile({ work: n, requestedDoi: null, crossref, repository: noRepos, asOf });
    expect(r.locations).toEqual([expect.objectContaining({ landingUrl: 'https://doi.org/10.1000/paper.1', licence: 'cc-by', reportedBy: 'crossref' })]);
    expect(computeAccessTier(r.locations, 'not_peer_reviewed').tier).toBe('read_here');
  });

  it('rule 1: a TDM-only deposit changes nothing (gs-20)', () => {
    const n = normaliseWork(work({
      locations: [{ is_oa: false, landing_page_url: 'https://link.springer.com/x', version: 'publishedVersion', source: { display_name: 'JCST', type: 'journal' } }],
    }));
    const crossref: CrossrefWork = { DOI: '10.1000/paper.1', license: [{ URL: 'https://www.springer.com/tdm', 'content-version': 'tdm' }] };
    const r = reconcile({ work: n, requestedDoi: null, crossref, repository: noRepos, asOf });
    expect(r.events).toEqual([]);
    expect(computeAccessTier(r.locations, 'peer_reviewed').tier).toBe('metadata_only');
  });

  it('rule 4: a draft OpenAlex merged into its published version stays its own record (gs-37)', () => {
    const merged = normaliseWork(work({
      id: 'https://openalex.org/W3198344353',
      doi: 'https://doi.org/10.3390/jrfm14090427',
      locations: [
        { is_oa: true, landing_page_url: 'https://www.mdpi.com/x', version: 'publishedVersion', license: 'cc-by', source: { display_name: 'JRFM', type: 'journal' } },
        { is_oa: true, landing_page_url: 'https://www.preprints.org/manuscript/202108.0555', version: 'acceptedVersion', license: 'cc-by', source: { display_name: 'Preprints.org', type: 'repository' } },
      ],
    }));
    const draft = reconcile({ work: merged, requestedDoi: '10.20944/preprints202108.0555.v1', crossref: { DOI: '10.20944/preprints202108.0555.v1', type: 'posted-content' }, repository: noRepos, asOf });
    expect(draft.isDraft).toBe(true);
    expect(draft.publishedVersionDoi).toBe('10.3390/jrfm14090427');
    expect(draft.identifiers).toMatchObject({ doi: '10.20944/preprints202108.0555.v1', openalexId: null });
    expect(draft.locations).toEqual([expect.objectContaining({ hostType: 'preprint_server', version: 'submittedVersion' })]);
    expect(draft.events.map((e) => e.rule)).toEqual([4, 4]);
    expect(computeAccessTier(draft.locations, 'preprint')).toEqual({ tier: 'read_here', licence: 'cc-by' });

    // The published paper keeps the preprint copy, as a submitted version that lifts nothing.
    const published = reconcile({ work: merged, requestedDoi: '10.3390/jrfm14090427', crossref: null, repository: noRepos, asOf });
    expect(published.isDraft).toBe(false);
    expect(only(published.locations, (l) => l.hostType === 'preprint_server').version).toBe('submittedVersion');
    expect(computeAccessTier(published.locations, 'peer_reviewed')).toEqual({ tier: 'read_here', licence: 'cc-by' });
  });

  it('rule 4: Crossref\'s is-preprint-of links an unmerged draft', () => {
    const n = normaliseWork(work({ doi: 'https://doi.org/10.20944/preprints1', type: 'preprint' }));
    const r = reconcile({ work: n, requestedDoi: '10.20944/preprints1', crossref: { DOI: '10.20944/preprints1', type: 'posted-content', relation: { 'is-preprint-of': [{ id: '10.1000/pub', 'id-type': 'doi' }] } }, repository: noRepos, asOf });
    expect(r).toMatchObject({ isDraft: true, publishedVersionDoi: '10.1000/pub' });
    expect(r.identifiers.openalexId).toBe('W1'); // not merged: the id is its own
  });

  it('collects retractions from Crossref and OpenAlex', () => {
    const n = normaliseWork(work({ is_retracted: true }));
    expect(reconcile({ work: n, requestedDoi: null, crossref: null, repository: noRepos, asOf }).updates)
      .toEqual([{ kind: 'retracted', noticeDoi: null, source: 'openalex' }]);
    const withNotice = reconcile({ work: n, requestedDoi: null, crossref: { DOI: '10.1000/paper.1', 'updated-by': [{ DOI: '10.1000/notice', type: 'retraction' }] }, repository: noRepos, asOf });
    expect(withNotice.updates).toEqual([{ kind: 'retracted', noticeDoi: '10.1000/notice', source: 'crossref' }]);
  });
});

describe('classifyPeerReview', () => {
  it.each([
    [{ workType: 'article', crossrefType: 'journal-article', venueType: 'journal' as const, isDraft: false }, 'peer_reviewed'],
    [{ workType: 'article', crossrefType: 'proceedings-article', venueType: 'conference' as const, isDraft: false }, 'peer_reviewed'],
    [{ workType: 'preprint', crossrefType: 'posted-content', venueType: 'repository' as const, isDraft: false }, 'preprint'],
    [{ workType: 'article', crossrefType: null, venueType: 'journal' as const, isDraft: true }, 'preprint'],
    [{ workType: 'editorial', crossrefType: 'journal-article', venueType: 'journal' as const, isDraft: false }, 'not_peer_reviewed'],
    [{ workType: 'article', crossrefType: null, venueType: 'repository' as const, isDraft: false }, 'not_peer_reviewed'],
    [{ workType: 'article', crossrefType: null, venueType: null, isDraft: false }, 'unknown'],
    // From the first live backfill: OpenAlex's type for proceedings papers.
    [{ workType: 'conference-paper', crossrefType: 'proceedings-article', venueType: 'conference' as const, isDraft: false }, 'peer_reviewed'],
    [{ workType: 'conference-paper', crossrefType: 'proceedings-article', venueType: 'book_series' as const, isDraft: false }, 'peer_reviewed'],
    [{ workType: 'conference-paper', crossrefType: null, venueType: null, isDraft: false }, 'unknown'],
    [{ workType: 'book', crossrefType: 'book', venueType: 'other' as const, isDraft: false }, 'not_peer_reviewed'],
    [{ workType: 'book-chapter', crossrefType: 'book-chapter', venueType: 'other' as const, isDraft: false }, 'unknown'],
  ])('%o → %s', (input, status) => {
    expect(classifyPeerReview(input).status).toBe(status);
  });

  it('records the basis it decided on', () => {
    expect(classifyPeerReview({ workType: 'article', crossrefType: null, venueType: 'journal', isDraft: false }).basis).toBe('venue:journal+type:article');
  });
});

describe('scoreRelevance', () => {
  it('excludes a work that names neither bitcoin nor crypto-assets', () => {
    expect(scoreRelevance('Deep learning for protein folding', 'We fold proteins.').band).toBe('clear_exclude');
    expect(scoreRelevance('A bit coin purse in Roman Britain', null).band).toBe('clear_exclude');
  });

  it('bands bitcoin in the title as likely core', () => {
    expect(scoreRelevance('Accounting for Bitcoin holdings under IFRS', null).band).toBe('likely_core');
  });

  it('keeps crypto-generic papers in play, as substantial candidates', () => {
    expect(scoreRelevance('IAS 38 and cryptocurrencies', 'Intangible asset treatment of crypto-assets.').band).toBe('likely_substantial');
  });

  it('bands one passing mention as likely peripheral', () => {
    expect(scoreRelevance('Forecasting 30 assets with transformers', 'Assets include gold, oil and bitcoin.').band).toBe('likely_peripheral');
  });

  it('maps bands to the fallback tier', () => {
    expect(tierForBand('likely_core')).toBe('core');
    expect(tierForBand('clear_exclude')).toBe('excluded');
  });
});

describe('computeAccessTier agrees with every golden-set label', () => {
  type Copy = { host: Location['hostType']; version: Location['version']; licence: string | null; isOa?: boolean };
  type Entry = { id: string; copies: Copy[]; expected: { accessTier: string; bestLicence: string | null; peerReviewStatus: PeerReviewStatus } };
  const entries = JSON.parse(readFileSync(new URL('../../../evals/library-papers/golden-set.json', import.meta.url), 'utf8')) as Entry[];

  it('covers all 40 entries', () => expect(entries).toHaveLength(40));

  it.each(entries.map((e) => [e.id, e] as const))('%s', (_id, e) => {
    // The copies are the reconciled truth, so a repository copy is confirmed.
    const locations = e.copies.map((c) => ({
      hostType: c.host, version: c.version, licence: c.licence,
      isOa: c.isOa ?? c.licence != null, verifiedAtHost: c.host === 'repository',
    }));
    expect(computeAccessTier(locations, e.expected.peerReviewStatus)).toEqual({ tier: e.expected.accessTier, licence: e.expected.bestLicence });
  });
});
