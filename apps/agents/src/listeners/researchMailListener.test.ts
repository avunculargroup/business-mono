import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildJmapEmail } from '../../test/factories.js';

// processResearchEmail orchestrates the pure email helpers (used for real) plus
// two heavy collaborators (metadata extraction + the ingestion pipeline), which
// we mock. @platform/db is stubbed because the module imports it at load for the
// polling functions (processResearchEmail itself never touches it).
const extractNewsMetadata = vi.fn();
const ingestNewsItem = vi.fn();

vi.mock('@platform/db', () => ({ supabase: {} }));
vi.mock('../workflows/newsExtract.js', () => ({ extractNewsMetadata }));
vi.mock('../workflows/ingestNewsItem.js', () => ({ ingestNewsItem }));

const { processResearchEmail } = await import('./researchMailListener.js');

const GROMEN = {
  id: 'src-gromen',
  name: 'Gromen Tree Rings',
  slug: 'gromen',
  tier: 'tier_1',
  sender_allowlist: ['gromen.com'],
};

function sources(...list: Array<typeof GROMEN>): Map<string, typeof GROMEN> {
  const m = new Map<string, typeof GROMEN>();
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
