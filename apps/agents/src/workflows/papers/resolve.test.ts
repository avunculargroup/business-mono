import { describe, expect, it, vi } from 'vitest';

// Rex is called through deps.confirmRelevance; the agent module itself must not load.
const rexGenerate = vi.fn();
vi.mock('../../agents/researcher/index.js', () => ({ rex: { generate: rexGenerate } }));
vi.mock('../../config/model.js', () => ({ stepRequestContext: vi.fn((key: string) => ({ key })) }));

const { resolvePaper } = await import('./resolve.js');
const { confirmRelevance, CONFIRM_RELEVANCE_SCOPE } = await import('./confirmRelevance.js');
import type { ResolveDeps } from './resolve.js';
import type { OpenAlexWork } from './openalex.js';
import type { CrossrefWork } from './crossref.js';
import type { RelevanceVerdict } from './confirmRelevance.js';

// Hand-built OpenAlex/Crossref shapes, as in resolve.logic.test.ts.

const PUBLISHED: OpenAlexWork = {
  id: 'https://openalex.org/W3198344353',
  doi: 'https://doi.org/10.3390/jrfm14090427',
  title: 'The Ascent of Bitcoin: Bibliometric Analysis of Bitcoin Research',
  publication_year: 2021,
  type: 'article',
  primary_location: { source: { id: 'https://openalex.org/S1', display_name: 'JRFM', type: 'journal' } },
  locations: [
    { is_oa: true, landing_page_url: 'https://www.mdpi.com/x', version: 'publishedVersion', license: 'cc-by', source: { display_name: 'JRFM', type: 'journal' } },
    { is_oa: true, landing_page_url: 'https://www.preprints.org/manuscript/202108.0555', version: 'acceptedVersion', license: 'cc-by', source: { display_name: 'Preprints.org', type: 'repository' } },
  ],
  authorships: [{ author: { id: 'https://openalex.org/A1', display_name: 'A. Aysan' } }],
  abstract_inverted_index: { We: [0], map: [1], bitcoin: [2], research: [3] },
};

const VERDICT: RelevanceVerdict = { tier: 'core', bitcoin_role: 'The object of study.', topics: ['adoption'], confidence: 0.9, reasons: 'Bitcoin is in the title.' };

function deps(over: Partial<ResolveDeps> = {}): ResolveDeps & { committed: Record<string, unknown>[] } {
  const committed: Record<string, unknown>[] = [];
  return {
    committed,
    getWork: vi.fn(async () => PUBLISHED),
    getCrossrefWork: vi.fn(async (): Promise<CrossrefWork | null> => null),
    confirmAtRepository: vi.fn(async () => null),
    confirmRelevance: vi.fn(async () => VERDICT),
    commit: vi.fn(async (payload: Record<string, unknown>) => {
      committed.push(payload);
      return `paper-${committed.length}`;
    }),
    now: () => new Date('2026-10-19'),
    ...over,
  };
}

describe('resolvePaper', () => {
  it('resolves a published paper into one commit, with Rex\'s verdict', async () => {
    const d = deps();
    const result = await resolvePaper({ doi: '10.3390/jrfm14090427', discoveredVia: '00000000-0000-0000-0000-000000000001' }, d);
    expect(result).toEqual({ status: 'committed', paperId: 'paper-1', relevanceTier: 'core', peerReviewStatus: 'peer_reviewed', isDraft: false });
    expect(d.committed).toHaveLength(1);
    expect(d.committed[0]).toMatchObject({
      identifiers: { doi: '10.3390/jrfm14090427', openalex_id: 'W3198344353' },
      peer_review_status: 'peer_reviewed',
      relevance_tier: 'core',
      relevance_basis: { rex_status: 'confirmed' },
      topics: ['adoption'],
      abstract: { text: 'We map bitcoin research', source: 'openalex_index' },
      discovered_via: '00000000-0000-0000-0000-000000000001',
      venue: { openalex_source_id: 'S1', name: 'JRFM' },
    });
  });

  it('commits a merged draft as its own record, after its published version (rule 4, gs-37)', async () => {
    const d = deps({
      getCrossrefWork: vi.fn(async (doi: string) => doi.startsWith('10.20944')
        ? { DOI: doi, type: 'posted-content', title: ['The Ascent of Bitcoin (preprint)'] }
        : null),
    });
    const result = await resolvePaper({ doi: '10.20944/preprints202108.0555.v1' }, d);
    expect(result).toMatchObject({ status: 'committed', peerReviewStatus: 'preprint', isDraft: true });
    expect(d.getWork).toHaveBeenCalledTimes(1); // the published work is the same OpenAlex object
    expect(d.committed.map((p) => (p.identifiers as { doi: string }).doi)).toEqual([
      '10.3390/jrfm14090427',
      '10.20944/preprints202108.0555.v1',
    ]);
    const draft = d.committed[1];
    expect(draft).toMatchObject({
      identifiers: { openalex_id: null },
      title: 'The Ascent of Bitcoin (preprint)',
      venue: null,
      authors: [],
      published_version_doi: '10.3390/jrfm14090427',
      work_type: 'preprint',
    });
    expect(draft.locations).toEqual([expect.objectContaining({ host_type: 'preprint_server', version: 'submittedVersion' })]);
  });

  it('never asks Rex about a clear exclude', async () => {
    const d = deps({ getWork: vi.fn(async () => ({ ...PUBLISHED, title: 'Protein folding at scale', abstract_inverted_index: { Proteins: [0] } })) });
    const result = await resolvePaper({ doi: '10.3390/jrfm14090427' }, d);
    expect(d.confirmRelevance).not.toHaveBeenCalled();
    expect(result).toMatchObject({ relevanceTier: 'excluded' });
    expect(d.committed[0]).toMatchObject({ relevance_basis: { rex_status: 'skipped_clear_exclude' } });
  });

  it('keeps the band\'s tier when Rex is unavailable, and says so', async () => {
    const d = deps({ confirmRelevance: vi.fn(async () => null) });
    const result = await resolvePaper({ doi: '10.3390/jrfm14090427' }, d);
    expect(result).toMatchObject({ relevanceTier: 'core' });
    expect(d.committed[0]).toMatchObject({ relevance_basis: { rex_status: 'unavailable', rex: null } });
  });

  it('confirms repository copies before reconciling', async () => {
    const d = deps({
      getWork: vi.fn(async () => ({
        ...PUBLISHED,
        locations: [{ is_oa: false, landing_page_url: 'https://eprints.soton.ac.uk/447739', version: 'acceptedVersion', source: { display_name: 'Southampton', type: 'repository' } }],
      })),
      confirmAtRepository: vi.fn(async () => ({ version: 'acceptedVersion' as const, isOa: true, licence: null, recordUrl: null, evidence: 'content: accepted, security: public' })),
    });
    await resolvePaper({ doi: '10.3390/jrfm14090427' }, d);
    expect(d.confirmAtRepository).toHaveBeenCalledWith(
      { landingUrl: 'https://eprints.soton.ac.uk/447739', pdfUrl: null, sourceId: null },
      '10.3390/jrfm14090427',
    );
    expect(d.committed[0].locations).toEqual([expect.objectContaining({ is_oa: true, verified_at_host: true, reported_by: 'repository' })]);
    expect(d.committed[0].reconciled).toEqual([expect.objectContaining({ rule: 3 })]);
  });

  it('carries on without Crossref when Crossref fails', async () => {
    const d = deps({ getCrossrefWork: vi.fn(async () => { throw new Error('503'); }) });
    expect(await resolvePaper({ doi: '10.3390/jrfm14090427' }, d)).toMatchObject({ status: 'committed' });
  });

  it('does not register a retraction notice as a paper', async () => {
    const d = deps({ getCrossrefWork: vi.fn(async () => ({ DOI: '10.1016/j.irfa.2026.105078', 'update-to': [{ DOI: '10.1000/x', type: 'retraction' }] })) });
    expect(await resolvePaper({ doi: '10.1016/j.irfa.2026.105078' }, d)).toMatchObject({ status: 'notice' });
    expect(d.committed).toHaveLength(0);
  });

  it('resolves nothing without an identifier (rule 5: never on a title)', async () => {
    const d = deps();
    expect(await resolvePaper({}, d)).toMatchObject({ status: 'no_identifier' });
    expect(d.getWork).not.toHaveBeenCalled();
  });

  it('reports a work OpenAlex does not have', async () => {
    const d = deps({ getWork: vi.fn(async () => null) });
    expect(await resolvePaper({ doi: '10.1000/missing' }, d)).toMatchObject({ status: 'not_found' });
  });
});

describe('confirmRelevance', () => {
  const scores = { band: 'likely_core' as const, titleBitcoin: 1, abstractBitcoin: 2, titleCrypto: 0, abstractCrypto: 0, otherAssets: 0, abstractWords: 40 };

  it('asks Rex under its own model scope and returns a valid verdict', async () => {
    rexGenerate.mockResolvedValueOnce({ object: VERDICT });
    expect(await confirmRelevance({ title: 't', abstract: 'a', venue: null, workType: 'article', scores })).toEqual(VERDICT);
    expect(rexGenerate.mock.calls[0][1]).toMatchObject({ requestContext: { key: CONFIRM_RELEVANCE_SCOPE } });
  });

  it('asks once more after a malformed verdict, and takes the second answer', async () => {
    rexGenerate.mockClear();
    rexGenerate.mockResolvedValueOnce({ object: { tier: 'pivotal' } }).mockResolvedValueOnce({ object: VERDICT });
    expect(await confirmRelevance({ title: 't', abstract: null, venue: null, workType: null, scores })).toEqual(VERDICT);
    expect(rexGenerate).toHaveBeenCalledTimes(2);
    expect(rexGenerate.mock.calls[1][0][0].content).toContain('did not match the schema');
  });

  it('returns null after two malformed verdicts or on an error, never throws', async () => {
    rexGenerate.mockResolvedValueOnce({ object: { tier: 'pivotal' } }).mockResolvedValueOnce({ object: { tier: 'pivotal' } });
    expect(await confirmRelevance({ title: 't', abstract: null, venue: null, workType: null, scores })).toBeNull();
    rexGenerate.mockRejectedValueOnce(new Error('overloaded'));
    expect(await confirmRelevance({ title: 't', abstract: null, venue: null, workType: null, scores })).toBeNull();
  });

  it('rejects a topic outside the controlled vocabulary', async () => {
    rexGenerate.mockResolvedValueOnce({ object: { ...VERDICT, topics: ['vibes'] } }).mockResolvedValueOnce({ object: { ...VERDICT, topics: ['vibes'] } });
    expect(await confirmRelevance({ title: 't', abstract: null, venue: null, workType: null, scores })).toBeNull();
  });
});
