import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const createLinkedInPost = vi.fn();

vi.mock('@platform/db', () => ({
  get supabase() {
    return fakeSupabase;
  },
}));
vi.mock('../lib/linkedin.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/linkedin.js')>();
  return {
    ...actual,
    createLinkedInPost: (...args: unknown[]) => createLinkedInPost(...args),
  };
});

const { runPublishTick, guardErrorFor, checkTokenExpiryWarnings } = await import(
  './socialPublishListener.js'
);
const { LinkedInAuthError } = await import('../lib/linkedin.js');

const ACCOUNT_ID = 'acc-1';

function dueItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ci-1',
    title: 'Post',
    body: 'A post body.',
    approved_by: 'tm-1',
    compliance_status: 'cleared',
    is_thread: false,
    publish_attempts: 0,
    publish_error: null,
    social_account_id: ACCOUNT_ID,
    ...overrides,
  };
}

function credential(overrides: Record<string, unknown> = {}) {
  return {
    social_account_id: ACCOUNT_ID,
    access_token: 'tok',
    author_urn: 'urn:li:person:abc',
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    consecutive_failures: 0,
    ...overrides,
  };
}

const activeAccount = { id: ACCOUNT_ID, display_name: 'Chris', is_active: true };

function accountsMap() {
  return new Map([[ACCOUNT_ID, activeAccount]]);
}
function credentialsMap(cred = credential()) {
  return new Map([[ACCOUNT_ID, cred]]);
}

function wireTick({
  item = dueItem(),
  cred = credential(),
  claimResponses,
}: {
  item?: ReturnType<typeof dueItem> | null;
  cred?: ReturnType<typeof credential> | null;
  claimResponses?: Array<{ data: unknown; error: null }>;
} = {}) {
  fakeSupabase.__setResponses('content_items', [
    { data: item ? [item] : [], error: null },
    ...(claimResponses ?? [{ data: [{ id: 'ci-1' }], error: null }]),
    { data: null, error: null }, // post-claim result update
    { data: null, error: null },
  ]);
  fakeSupabase.__setResponse('platform_specs', { data: { max_chars: 3000 }, error: null });
  fakeSupabase.__setResponse('social_accounts', { data: [activeAccount], error: null });
  fakeSupabase.__setResponse('social_credentials', {
    data: cred ? [cred] : [],
    error: null,
  });
  fakeSupabase.__setResponse('agent_activity', { data: null, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeSupabase.__responses.clear();
  fakeSupabase.__builders.length = 0;
});

describe('guardErrorFor', () => {
  it('passes a fully approved, cleared, connected item', () => {
    expect(guardErrorFor(dueItem(), accountsMap(), credentialsMap(), 3000)).toBeNull();
  });

  it('requires human approval', () => {
    expect(guardErrorFor(dueItem({ approved_by: null }), accountsMap(), credentialsMap(), 3000)).toMatch(
      /approve/i,
    );
  });

  it('requires compliance clearance, accepting overridden', () => {
    expect(
      guardErrorFor(dueItem({ compliance_status: 'pending' }), accountsMap(), credentialsMap(), 3000),
    ).toMatch(/compliance/i);
    expect(
      guardErrorFor(dueItem({ compliance_status: 'flagged' }), accountsMap(), credentialsMap(), 3000),
    ).toMatch(/compliance/i);
    expect(
      guardErrorFor(dueItem({ compliance_status: 'overridden' }), accountsMap(), credentialsMap(), 3000),
    ).toBeNull();
  });

  it('rejects threads, missing credentials, expired and failing credentials', () => {
    expect(guardErrorFor(dueItem({ is_thread: true }), accountsMap(), credentialsMap(), 3000)).toMatch(
      /thread/i,
    );
    expect(guardErrorFor(dueItem(), accountsMap(), new Map(), 3000)).toMatch(/not connected/i);
    expect(
      guardErrorFor(
        dueItem(),
        accountsMap(),
        credentialsMap(credential({ expires_at: new Date(Date.now() - 1000).toISOString() })),
        3000,
      ),
    ).toMatch(/expired/i);
    expect(
      guardErrorFor(dueItem(), accountsMap(), credentialsMap(credential({ consecutive_failures: 3 })), 3000),
    ).toMatch(/reconnect/i);
  });

  it('rejects inactive accounts and over-length bodies', () => {
    expect(
      guardErrorFor(dueItem(), new Map([[ACCOUNT_ID, { ...activeAccount, is_active: false }]]), credentialsMap(), 3000),
    ).toMatch(/inactive/i);
    expect(guardErrorFor(dueItem({ body: 'x'.repeat(3001) }), accountsMap(), credentialsMap(), 3000)).toMatch(
      /3000/,
    );
  });
});

describe('runPublishTick', () => {
  it('claims, posts, and marks the item published', async () => {
    wireTick();
    createLinkedInPost.mockResolvedValue({ postUrn: 'urn:li:share:9' });

    await runPublishTick();

    expect(createLinkedInPost).toHaveBeenCalledWith({
      accessToken: 'tok',
      authorUrn: 'urn:li:person:abc',
      text: 'A post body.',
    });

    const builders = fakeSupabase.__buildersFor('content_items');
    // builders[0] = due select, [1] = claim, [2] = published update
    const claim = builders[1]!;
    expect(claim.update).toHaveBeenCalledWith({ publish_locked_at: expect.any(String) });
    expect(claim.is).toHaveBeenCalledWith('publish_locked_at', null);
    expect(claim.eq).toHaveBeenCalledWith('status', 'scheduled');

    const publish = builders[2]!;
    expect(publish.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'published',
        published_url: 'https://www.linkedin.com/feed/update/urn%3Ali%3Ashare%3A9',
        publish_error: null,
      }),
    );

    const audit = fakeSupabase.__buildersFor('agent_activity')[0]!;
    expect(audit.insert).toHaveBeenCalledWith(
      expect.objectContaining({ agent_name: 'charlie', action: 'social_published', status: 'auto' }),
    );
  });

  it('does not post when the claim is lost to another tick', async () => {
    wireTick({ claimResponses: [{ data: [], error: null }] });
    createLinkedInPost.mockResolvedValue({ postUrn: 'urn:li:share:9' });

    await runPublishTick();

    expect(createLinkedInPost).not.toHaveBeenCalled();
  });

  it('holds unapproved items with a publish_error instead of posting', async () => {
    wireTick({ item: dueItem({ approved_by: null }) });

    await runPublishTick();

    expect(createLinkedInPost).not.toHaveBeenCalled();
    const hold = fakeSupabase.__buildersFor('content_items')[1]!;
    expect(hold.update).toHaveBeenCalledWith({ publish_error: expect.stringMatching(/approve/i) });
  });

  it('releases the claim and records the error on failure', async () => {
    wireTick();
    createLinkedInPost.mockRejectedValue(new Error('LinkedIn post failed: 500'));

    await runPublishTick();

    const failure = fakeSupabase.__buildersFor('content_items')[2]!;
    expect(failure.update).toHaveBeenCalledWith(
      expect.objectContaining({
        publish_locked_at: null,
        publish_attempts: 1,
        publish_error: 'LinkedIn post failed: 500',
      }),
    );
  });

  it('bumps credential consecutive_failures on auth errors', async () => {
    wireTick();
    createLinkedInPost.mockRejectedValue(new LinkedInAuthError('urn:li:person:abc'));

    await runPublishTick();

    const credentialUpdate = fakeSupabase.__buildersFor('social_credentials')[1]!;
    expect(credentialUpdate.update).toHaveBeenCalledWith(
      expect.objectContaining({ consecutive_failures: 1, last_error: expect.stringContaining('401') }),
    );
  });

  it('skips items that exhausted their attempts', async () => {
    wireTick({ item: dueItem({ publish_attempts: 3, publish_error: 'Failed after 3 attempts: boom' }) });

    await runPublishTick();

    expect(createLinkedInPost).not.toHaveBeenCalled();
    // Only the due select — no claim, no error rewrite.
    expect(fakeSupabase.__buildersFor('content_items')).toHaveLength(1);
  });
});

describe('checkTokenExpiryWarnings', () => {
  it('raises one warning per expiring credential, deduped weekly', async () => {
    fakeSupabase.__setResponse('social_credentials', {
      data: [{ social_account_id: ACCOUNT_ID, expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString() }],
      error: null,
    });
    fakeSupabase.__setResponses('agent_activity', [
      { data: [], error: null }, // no recent warning
      { data: null, error: null }, // insert
    ]);

    await checkTokenExpiryWarnings();

    const insert = fakeSupabase.__buildersFor('agent_activity')[1]!;
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'linkedin_token_expiring',
        entity_id: ACCOUNT_ID,
        notes: expect.stringContaining('5 day'),
      }),
    );
  });

  it('does not duplicate a recent warning', async () => {
    fakeSupabase.__setResponse('social_credentials', {
      data: [{ social_account_id: ACCOUNT_ID, expires_at: new Date().toISOString() }],
      error: null,
    });
    fakeSupabase.__setResponse('agent_activity', { data: [{ id: 'aa-1' }], error: null });

    await checkTokenExpiryWarnings();

    const activityBuilders = fakeSupabase.__buildersFor('agent_activity');
    expect(activityBuilders).toHaveLength(1); // dedupe select only, no insert
  });
});
