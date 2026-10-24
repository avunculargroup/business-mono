import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildJmapEmail } from '../../test/factories.js';
import { createFakeSupabase } from '../../test/mocks/supabase.js';

// processResearchEmail orchestrates the pure email helpers (used for real) plus
// two heavy collaborators (metadata extraction + the ingestion pipeline), which
// we mock. @platform/db is the chainable fake: processResearchEmail writes the
// raw body to news_item_raw, and link following checks news_items for a url
// before spending anything on it.
const fakeSupabase = createFakeSupabase();
const extractNewsMetadata = vi.fn();
const ingestNewsItem = vi.fn();
const fetchUrlExecute = vi.fn();

vi.mock('@platform/db', () => ({ supabase: fakeSupabase }));
vi.mock('../workflows/newsExtract.js', () => ({ extractNewsMetadata }));
vi.mock('../workflows/ingestNewsItem.js', () => ({ ingestNewsItem }));
vi.mock('../agents/researcher/tools.js', () => ({ fetchUrl: { execute: fetchUrlExecute } }));
// The paywall decision reads paywalled_domains; covered in its own test file.
vi.mock('../lib/paywalledDomains.js', () => ({
  resolvePaywalled: vi.fn(async ({ page }: { page: boolean | null }) => page),
}));

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
  fakeSupabase.__builders.length = 0;
  fakeSupabase.__responses.clear();
  fakeSupabase.from.mockClear();
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

describe('processResearchEmail extraction', () => {
  it('stores the raw html in news_item_raw with the extractor version', async () => {
    await processResearchEmail(newsletterEmail(), sources(GROMEN));
    const [raw] = fakeSupabase.__buildersFor('news_item_raw');
    expect(raw).toBeDefined();
    expect(raw!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        news_item_id: 'news-1',
        format: 'html',
        raw: expect.stringContaining('<h1>Tree Rings</h1>'),
        extractor_version: expect.stringMatching(/^email-/),
      }),
    );
  });

  it('stores nothing raw when the item was a duplicate', async () => {
    ingestNewsItem.mockResolvedValue({ status: 'duplicate', reason: 'ingestion_ref' });
    await processResearchEmail(newsletterEmail(), sources(GROMEN));
    expect(fakeSupabase.__buildersFor('news_item_raw')).toHaveLength(0);
  });

  it('drops the subject line from the body and strips tracking from canonical_url', async () => {
    const email = newsletterEmail({
      htmlBody:
        '<p>Tree Rings — Issue 42</p>' +
        '<p><a href="https://gromen.com/issue-42?utm_source=nl&amp;_hsenc=tok">View in browser</a></p>' +
        '<p>Fiscal dominance and treasury issuance dynamics in detail.</p>',
    });
    await processResearchEmail(email, sources(GROMEN));
    const arg = ingestNewsItem.mock.calls[0][0];
    expect(arg.canonicalUrl).toBe('https://gromen.com/issue-42');
    expect(arg.body).toBe('Fiscal dominance and treasury issuance dynamics in detail.');
  });

  it('keeps no canonical_url it cannot clean', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    try {
      const email = newsletterEmail({
        htmlBody: '<p><a href="https://example.ghost.io/r/0a1b2c3d?m=placeholder">View in browser</a></p><p>Body text here.</p>',
      });
      await processResearchEmail(email, sources(GROMEN));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(ingestNewsItem.mock.calls[0][0].canonicalUrl).toBeNull();
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

  it('resolves an opaque wrapper and stores the real URL, never the wrapper', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'https://afr.com/final-destination?utm_source=nl&_hsenc=tok' } }),
    );
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const email = newsletterEmail({
        htmlBody: '<p><a href="https://d1.na1.hubspotlinks.com/Ctc/OT+113/placeholder">RBA holds rates</a></p>',
      });
      await processResearchEmail(email, sources(ROUNDUP));
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchUrlExecute.mock.calls[0][0].url).toBe('https://afr.com/final-destination');
    const child = ingestNewsItem.mock.calls[1][0];
    expect(child.url).toBe('https://afr.com/final-destination');
    expect(child.ingestionRef).toBe('issue-42@gromen.com#link:https://afr.com/final-destination');
  });

  it('skips an unresolvable wrapper without fetching or storing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>js redirect</html>', { status: 200 })));
    try {
      const email = newsletterEmail({
        htmlBody: '<p><a href="https://example.ghost.io/r/0a1b2c3d?m=placeholder">A headline</a></p>',
      });
      const res = await processResearchEmail(email, sources(ROUNDUP));
      expect(res).toMatchObject({ followedLinks: { ingested: 0, skipped: 0 } });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(fetchUrlExecute).not.toHaveBeenCalled();
    expect(ingestNewsItem).toHaveBeenCalledTimes(1);
  });

  it('decodes a Seeking Alpha link and filters on the destination before any spend', async () => {
    const enc = (u: string) => Buffer.from(u).toString('base64');
    const email = newsletterEmail({
      htmlBody:
        `<p><a href="https://email-st.seekingalpha.com/click/1.2/${enc('https://twitter.com/sa')}/s">Follow us on X</a></p>` +
        `<p><a href="https://email-st.seekingalpha.com/click/1.3/${enc('https://seekingalpha.com/article/1-btc?userid=9')}/s">Bitcoin treasuries</a></p>`,
    });
    await processResearchEmail(email, sources(ROUNDUP));
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://seekingalpha.com/article/1-btc']);
    expect(ingestNewsItem.mock.calls[1][0].url).toBe('https://seekingalpha.com/article/1-btc');
  });

  it("applies the source's allow and deny patterns to the real URL", async () => {
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, link_deny_patterns: ['afr.com'] }));
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://wsj.com/fed-pivot']);

    fetchUrlExecute.mockClear();
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, link_allow_patterns: ['afr.com/'] }));
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://afr.com/rba-holds']);
  });

  it("never follows a link back to the newsletter's own domain", async () => {
    const email = newsletterEmail({
      htmlBody: '<p><a href="https://www.gromen.com/issue-41">Last week</a></p><p><a href="https://afr.com/x">RBA holds</a></p>',
    });
    await processResearchEmail(email, sources(ROUNDUP));
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://afr.com/x']);
  });

  it('skips a link already in news_items, and spends no budget on it', async () => {
    fakeSupabase.__setResponses('news_items', [{ data: [{ id: 'existing' }], error: null }]);
    const budget = { remaining: 5 };
    await processResearchEmail(roundupEmail(), sources(ROUNDUP), budget);
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://wsj.com/fed-pivot']);
    expect(budget.remaining).toBe(4);
  });

  it('spends the cap on survivors, not on chrome that precedes them', async () => {
    const email = newsletterEmail({
      htmlBody:
        '<p><a href="https://x.com/a">Our X</a> <a href="https://linkedin.com/b">Our LinkedIn</a></p>' +
        '<p><a href="https://afr.com/rba-holds">RBA holds rates</a></p>',
    });
    const budget = { remaining: 1 };
    await processResearchEmail(email, sources({ ...ROUNDUP, max_followed_links: 1 }), budget);
    expect(fetchUrlExecute.mock.calls.map((c) => c[0].url)).toEqual(['https://afr.com/rba-holds']);
    expect(budget.remaining).toBe(0);
  });

  it('passes the source extract config to the fetch and flags a truncated body', async () => {
    fetchUrlExecute.mockResolvedValue({ title: 'T', markdown: ARTICLE_BODY, truncated: true });
    await processResearchEmail(
      roundupEmail(),
      sources({ ...ROUNDUP, max_followed_links: 1, link_extract_config: { targetSelector: 'article' } }),
    );
    expect(fetchUrlExecute.mock.calls[0][0]).toEqual({ url: 'https://afr.com/rba-holds', target_selector: 'article' });
    expect(ingestNewsItem.mock.calls[1][0].bodyTruncated).toBe(true);
  });

  it('normalises the fetched body before the length check', async () => {
    fetchUrlExecute.mockResolvedValue({ title: 'T', markdown: `![Image 1: x](https://cdn/x.png)\n${'\u200b'.repeat(900)}short` });
    const res = await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, max_followed_links: 1 }));
    expect(res).toMatchObject({ followedLinks: { ingested: 0, skipped: 1 } });
  });

  it('falls back to anchor text when the fetch returns no title', async () => {
    fetchUrlExecute.mockResolvedValue({ title: '  ', markdown: ARTICLE_BODY });
    await processResearchEmail(roundupEmail(), sources({ ...ROUNDUP, max_followed_links: 1 }));
    expect(ingestNewsItem.mock.calls[1][0].title).toBe('RBA holds rates');
  });
});
