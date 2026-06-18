import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RoutineResult } from '@platform/shared';

// ── Hoisted mocks (referenced inside vi.mock factories) ────────────────────────
const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  getIdentities: vi.fn(),
  getMailboxes: vi.fn(),
  sendHtmlEmail: vi.fn(),
  from: vi.fn(),
  listUsers: vi.fn(),
}));

vi.mock('@platform/db', () => ({
  supabase: {
    from: h.from,
    auth: { admin: { listUsers: h.listUsers } },
  },
}));

vi.mock('./fastmailJmap.js', () => ({
  FastmailJmapClient: vi.fn().mockImplementation(() => ({
    getSession: h.getSession,
    getIdentities: h.getIdentities,
    getDraftsAndSentMailboxIds: h.getMailboxes,
    sendHtmlEmail: h.sendHtmlEmail,
  })),
}));

import { deliverNewsDigest } from './sendNewsDigest.js';

const TABLE_DATA: Record<string, unknown> = {
  team_members: [
    { id: 'u1', full_name: 'Chris Pollard' },
    { id: 'u2', full_name: 'Carolyn Crawford' },
  ],
  company_records: [
    { type_key: 'trading_name', value: 'Bitcoin Treasury Solutions' },
    { type_key: 'abn', value: '82683088173' },
    { type_key: 'website', value: 'https://www.bitcointreasurysolutions.com.au' },
  ],
};

function wireSupabase() {
  h.from.mockImplementation((table: string) => {
    const resp = { data: TABLE_DATA[table] ?? null, error: null };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: () => Promise.resolve({ data: null, error: null }),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resp).then(onFulfilled),
    };
    return builder;
  });
  h.listUsers.mockResolvedValue({
    data: {
      users: [
        { id: 'u1', email: 'chris@btreasury.com.au' },
        { id: 'u2', email: 'carri@btreasury.com.au' },
      ],
    },
    error: null,
  });
}

function wireJmap() {
  h.getSession.mockResolvedValue({ accountId: 'acc', apiUrl: 'https://api/' });
  h.getIdentities.mockResolvedValue([{ id: 'id1', email: 'hq@btreasury.com.au', name: 'BTS' }]);
  h.getMailboxes.mockResolvedValue({ draftsId: 'd', sentId: 's' });
  h.sendHtmlEmail.mockResolvedValue(undefined);
}

const result: RoutineResult = {
  summary: 'Curated 1 story.',
  sources: [],
  metadata: {
    mood_summary: 'Calm session, steady flows',
    stories: [
      { kind: 'news', id: '1', title: 'A headline', url: 'https://x.example/a', source_name: 'Src', category: 'news' },
    ],
    more_news_url: '/news',
  },
};

const routine = { id: 'routine_1', title: 'Daily news curation' };

describe('deliverNewsDigest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wireSupabase();
    wireJmap();
  });

  it('skips entirely when the sender env vars are absent', async () => {
    // setup.ts does not set these, but be explicit in case of leakage.
    vi.stubEnv('FASTMAIL_DIGEST_USERNAME', '');
    vi.stubEnv('FASTMAIL_DIGEST_TOKEN', '');
    const out = await deliverNewsDigest(routine, result);
    expect(out).toEqual({ configured: false, attempted: 0, sent: 0, failed: 0 });
    expect(h.sendHtmlEmail).not.toHaveBeenCalled();
  });

  it('sends one email per team member from the configured identity', async () => {
    vi.stubEnv('FASTMAIL_DIGEST_USERNAME', 'hq@btreasury.com.au');
    vi.stubEnv('FASTMAIL_DIGEST_TOKEN', 'app-pw');

    const out = await deliverNewsDigest(routine, result);

    expect(out).toEqual({ configured: true, attempted: 2, sent: 2, failed: 0 });
    expect(h.sendHtmlEmail).toHaveBeenCalledTimes(2);

    const firstCall = h.sendHtmlEmail.mock.calls[0]![0] as {
      from: { email: string };
      to: Array<{ email: string }>;
      subject: string;
      identityId: string;
    };
    expect(firstCall.from.email).toBe('hq@btreasury.com.au');
    expect(firstCall.identityId).toBe('id1');
    expect(firstCall.to[0]!.email).toBe('chris@btreasury.com.au');
    expect(firstCall.subject).toContain('Bitcoin Treasury Solutions');
  });

  it('counts per-recipient failures without throwing', async () => {
    vi.stubEnv('FASTMAIL_DIGEST_USERNAME', 'hq@btreasury.com.au');
    vi.stubEnv('FASTMAIL_DIGEST_TOKEN', 'app-pw');
    h.sendHtmlEmail.mockRejectedValueOnce(new Error('mailbox over quota'));

    const out = await deliverNewsDigest(routine, result);

    expect(out).toEqual({ configured: true, attempted: 2, sent: 1, failed: 1 });
    // A failure is audited to agent_activity.
    expect(h.from).toHaveBeenCalledWith('agent_activity');
  });

  it('does not throw when session setup fails — routine stays unaffected', async () => {
    vi.stubEnv('FASTMAIL_DIGEST_USERNAME', 'hq@btreasury.com.au');
    vi.stubEnv('FASTMAIL_DIGEST_TOKEN', 'app-pw');
    h.getSession.mockRejectedValueOnce(new Error('401 Unauthorized'));

    const out = await deliverNewsDigest(routine, result);
    expect(out).toEqual({ configured: true, attempted: 0, sent: 0, failed: 0 });
    expect(h.sendHtmlEmail).not.toHaveBeenCalled();
  });
});
