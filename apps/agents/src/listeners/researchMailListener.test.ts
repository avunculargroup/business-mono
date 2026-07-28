import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildJmapEmail } from '../../test/factories.js';

// processResearchEmail orchestrates the pure email helpers (used for real) plus
// two heavy collaborators (metadata extraction + the ingestion pipeline), which
// we mock. @platform/db is stubbed because the module imports it at load for the
// polling functions (processResearchEmail itself never touches it).
const extractNewsMetadata = vi.fn();
const ingestNewsItem = vi.fn();
const fetchUrlExecute = vi.fn();

vi.mock('@platform/db', () => ({ supabase: {} }));
vi.mock('../workflows/newsExtract.js', () => ({ extractNewsMetadata }));
vi.mock('../workflows/ingestNewsItem.js', () => ({ ingestNewsItem }));
vi.mock('../agents/researcher/tools.js', () => ({ fetchUrl: { execute: fetchUrlExecute } }));

const { processResearchEmail } = await import('./researchMailListener.js');
type EmailSource = Parameters<typeof processResearchEmail>[1] extends Map<string, infer S> ? S : never;

const GROMEN: EmailSource = {
  id: 'src-gromen',
  name: 'Gromen Tree Rings',
  slug: 'gromen',
  tier: 'tier_1',
  sender_allowlist: ['gromen.com'],
  follow_links: false,
  max_followed_links: 5,
};

function sources(...list: EmailSource[]): Map<string, EmailSource> {
  const m = new Map<string, EmailSource>();
  for (const s of list) m.set(s.slug, s);
  return m;
}

function newsletterEmail(overrides: Parameters<typeof buildJmapEmail>[0] = {}) {
  return buildJmapEmail({
    subject: 'Tree Rings — Issue 42',
    from: [{ name: 'Luke Gromen', email: 'luke@gromen.com' }],
    to: [{ email: 'research+gromen@btreasury.com.au' }],
    htmlBody: '<h1>Tree Rings</h1><p>Fiscal dominance and treasury issuance dynamics in detail.</p>',
    headers: [
      { name: 'Message-ID', value: '<issue-42@gromen.com>' },
      { name: 'Authentication-Results', value: 'mx; spf=pass; dkim=pass' },
    ],
    ...overrides,
  });
}

beforeEach(() => {
  extractNewsMetadata.mockReset();
  extractNewsMetadata.mockResolvedValue({
    data: {
      category: 'macro',
      summary: 'Gromen on treasury issuance.',
      key_points: ['point a', 'point b'],
      topic_tags: ['macro', 'treasury-issuance'],
      australian_relevance: false,
      bitcoin_relevance: true,
    },
    reason: null,
  });
  ingestNewsItem.mockReset();
  ingestNewsItem.mockResolvedValue({ status: 'inserted', newsItemId: 'news-1', relevanceScore: 0.84, scoringFailed: false });
});

describe('processResearchEmail', () => {
  it('skips when no recipient is plus-addressed', async () => {
    const email = newsletterEmail({ to: [{ email: 'plain@btreasury.com.au' }] });
    const res = await processResearchEmail(email, sources(GROMEN));
    expect(res).toEqual({ status: 'skipped', reason: 'no_plus_address' });
    expect(ingestNewsItem).not.toHaveBeenCalled();
  });

  it('skips when the slug maps to no configured source', async () => {
    const email = newsletterEmail({ to: [{ email: 'research+unknown@btreasury.com.au' }] });
    const res = await processResearchEmail(email, sources(GROMEN));
    expect(res).toEqual({ status: 'skipped', reason: 'unknown_source:unknown' });
  });

  it('skips when the sender is not on the allowlist', async () => {
    const email = newsletterEmail({ from: [{ name: 'Imposter', email: 'spoof@evil.com' }] });
    const res = await processResearchEmail(email, sources(GROMEN));
    expect(res.status).toBe('skipped');
    expect((res as { reason: string }).reason).toContain('sender_not_allowed');
    expect(ingestNewsItem).not.toHaveBeenCalled();
  });

  it('skips on SPF/DKIM failure', async () => {
    const email = newsletterEmail({
      headers: [
        { name: 'Message-ID', value: '<x@gromen.com>' },
        { name: 'Authentication-Results', value: 'mx; spf=fail; dkim=pass' },
      ],
    });
    const res = await processResearchEmail(email, sources(GROMEN));
    expect(res).toEqual({ status: 'skipped', reason: 'auth_fail' });
  });

  it('skips when the body is empty', async () => {
    const email = newsletterEmail({ htmlBody: '   ', textBody: '' });
    const res = await processResearchEmail(email, sources(GROMEN));
    expect(res).toEqual({ status: 'skipped', reason: 'empty_body' });
  });

  it('ingests a valid newsletter with normalised fields', async () => {
    const email = newsletterEmail({
      attachments: [{ type: 'application/pdf', name: 'memo.pdf', disposition: 'attachment' }],
    });
    const res = await processResearchEmail(email, sources(GROMEN));

    expect(res).toEqual({ status: 'ingested', newsItemId: 'news-1', relevanceScore: 0.84 });
    expect(ingestNewsItem).toHaveBeenCalledTimes(1);
    expect(ingestNewsItem).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { id: 'src-gromen', name: 'Gromen Tree Rings', tier: 'tier_1' },
        title: 'Tree Rings — Issue 42',
        author: 'Luke Gromen',
        category: 'macro',
        keyPoints: ['point a', 'point b'],
        topicTags: ['macro', 'treasury-issuance'],
        ingestionRef: 'issue-42@gromen.com',
        hasPdfAttachment: true,
        attachmentCount: 1,
        ingestedBy: 'rex',
      }),
    );
    // body was converted to markdown (heading preserved, no raw tags)
    const arg = ingestNewsItem.mock.calls[0][0];
    expect(arg.body).toContain('# Tree Rings');
    expect(arg.url).toBe('email://gromen/issue-42%40gromen.com');
  });

  it('still ingests when metadata extraction fails, using fallbacks', async () => {
    extractNewsMetadata.mockResolvedValue({ data: null, reason: 'schema' });
    const res = await processResearchEmail(newsletterEmail(), sources(GROMEN));
    expect(res.status).toBe('ingested');
    const arg = ingestNewsItem.mock.calls[0][0];
    expect(arg.category).toBe('macro');     // default category
    expect(arg.keyPoints).toEqual([]);
    expect(arg.fallbackSummary).toBe('Tree Rings — Issue 42'); // falls back to title
  });

  it('propagates a duplicate result from the pipeline', async () => {
    ingestNewsItem.mockResolvedValue({ status: 'duplicate', reason: 'ingestion_ref' });
    const res = await processResearchEmail(newsletterEmail(), sources(GROMEN));
    expect(res).toEqual({ status: 'duplicate', reason: 'ingestion_ref' });
  });

  it('allows an empty allowlist (onboarding) and uses a composite ref without a Message-ID', async () => {
    const email = newsletterEmail({
      from: [{ name: 'New Sender', email: 'hello@newpub.com' }],
      headers: [], // no Message-ID, no auth headers
    });
    const res = await processResearchEmail(email, sources({ ...GROMEN, sender_allowlist: [] }));
    expect(res.status).toBe('ingested');
    const arg = ingestNewsItem.mock.calls[0][0];
    expect(arg.ingestionRef).toContain('gromen:');
  });
});

describe('processResearchEmail link following', () => {
  const ROUNDUP = {
    ...GROMEN,
    follow_links: true,
    max_followed_links: 5,
  };

  /** A roundup issue linking out to two articles plus the usual chrome. */
  function roundupEmail(): ReturnType<typeof newsletterEmail> {
    return newsletterEmail({
      htmlBody:
        '<p><a href="https://pub.example/issue/42">View this email in your browser</a></p>' +
        '<p>Commentary. <a href="https://afr.com/rba-holds">RBA holds rates</a></p>' +
        '<p>And <a href="https://wsj.com/fed-pivot">Fed signals pivot</a>.</p>' +
        '<p><a href="https://pub.example/u/1">Unsubscribe</a></p>',
    });
  }

  const ARTICLE_BODY = 'A'.repeat(2000);

  beforeEach(() => {
    fetchUrlExecute.mockReset();
    fetchUrlExecute.mockResolvedValue({
      title: 'Fetched headline',
      markdown: ARTICLE_BODY,
      resolved_url: undefined,
    });
  });

  it('does not follow links when the source has not opted in', async () => {
    const res = await processResearchEmail(roundupEmail(), sources(GROMEN));
    expect(res).toEqual({ status: 'ingested', newsItemId: 'news-1', relevanceScore: 0.84 });
    expect(fetchUrlExecute).not.toHaveBeenCalled();
    expect(ingestNewsItem).toHaveBeenCalledTimes(1);
  });

  it('ingests each substantive link as its own item, skipping chrome', async () => {
    const res = await processResearchEmail(roundupEmail(), sources(ROUNDUP));

    expect(res).toMatchObject({ status: 'ingested', followedLinks: { ingested: 2, skipped: 0 } });
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual([
      'https://afr.com/rba-holds',
      'https://wsj.com/fed-pivot',
    ]);
    expect(ingestNewsItem).toHaveBeenCalledTimes(3); // parent + 2 links

    const child = ingestNewsItem.mock.calls[1][0];
    expect(child).toMatchObject({
      source: { id: 'src-gromen', name: 'Gromen Tree Rings', tier: 'tier_1' },
      url: 'https://afr.com/rba-holds',
      title: 'Fetched headline',
      ingestionRef: 'issue-42@gromen.com#link:https://afr.com/rba-holds',
      rubricScopeKey: 'newsletterLinks.rubric_score',
      rexMetadataExtra: {
        from_newsletter_item_id: 'news-1',
        from_newsletter_anchor_text: 'RBA holds rates',
      },
    });
    expect(child.body).toBe(ARTICLE_BODY);
    // the followed-link metadata call uses its own model scope
    expect(extractNewsMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({ scopeKey: 'newsletterLinks.extract' }),
    );
  });

  it('never follows links when the parent was a duplicate', async () => {
    ingestNewsItem.mockResolvedValue({ status: 'duplicate', reason: 'ingestion_ref' });
    const res = await processResearchEmail(roundupEmail(), sources(ROUNDUP));
    expect(res).toEqual({ status: 'duplicate', reason: 'ingestion_ref' });
    expect(fetchUrlExecute).not.toHaveBeenCalled();
  });

  it('honours the per-source cap', async () => {
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, max_followed_links: 1 }));
    expect(fetchUrlExecute).toHaveBeenCalledTimes(1);
  });

  it('stops when the poll-cycle budget runs out mid-newsletter', async () => {
    const budget = { remaining: 1 };
    const res = await processResearchEmail(roundupEmail(), sources(ROUNDUP), budget);
    expect(fetchUrlExecute).toHaveBeenCalledTimes(1);
    expect(res).toMatchObject({ followedLinks: { ingested: 1, skipped: 0 } });
    expect(budget.remaining).toBe(0);
  });

  it('skips a paywall stub and a short body but still ingests its siblings', async () => {
    fetchUrlExecute
      .mockResolvedValueOnce({ title: 'Paywalled', markdown: `${'B'.repeat(1200)} Subscribe to continue reading` })
      .mockResolvedValueOnce({ title: 'Real', markdown: ARTICLE_BODY });
    const res = await processResearchEmail(roundupEmail(), sources(ROUNDUP));
    expect(res).toMatchObject({ followedLinks: { ingested: 1, skipped: 1 } });
    expect(ingestNewsItem).toHaveBeenCalledTimes(2); // parent + 1 link
  });

  it('skips a link whose fetch throws, without failing the newsletter', async () => {
    fetchUrlExecute
      .mockRejectedValueOnce(new Error('jina timeout'))
      .mockResolvedValueOnce({ title: 'Real', markdown: ARTICLE_BODY });
    const res = await processResearchEmail(roundupEmail(), sources(ROUNDUP));
    expect(res).toMatchObject({ status: 'ingested', followedLinks: { ingested: 1, skipped: 1 } });
  });

  it('prefers the redirect-resolved url over the tracking wrapper', async () => {
    fetchUrlExecute.mockResolvedValue({
      title: 'Fetched headline',
      markdown: ARTICLE_BODY,
      resolved_url: 'https://afr.com/final-destination',
    });
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, max_followed_links: 1 }));
    const child = ingestNewsItem.mock.calls[1][0];
    expect(child.url).toBe('https://afr.com/final-destination');
    // the ingestion_ref still keys off the in-email href, so re-delivery dedups
    expect(child.ingestionRef).toBe('issue-42@gromen.com#link:https://afr.com/rba-holds');
  });

  it('falls back to anchor text when the fetch returns no title', async () => {
    fetchUrlExecute.mockResolvedValue({ title: '  ', markdown: ARTICLE_BODY });
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, max_followed_links: 1 }));
    expect(ingestNewsItem.mock.calls[1][0].title).toBe('RBA holds rates');
  });
});
