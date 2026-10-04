import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  deliverTeamEmail: vi.fn(async () => ({ configured: true, attempted: 2, sent: 2, failed: 0 })),
  loadCompanyFooter: vi.fn(async () => ({ name: 'BTS' })),
}));

vi.mock('./sendNewsDigest.js', () => ({
  deliverTeamEmail: h.deliverTeamEmail,
  loadCompanyFooter: h.loadCompanyFooter,
}));

import { sendReviewQueueDigest } from './sendReviewQueueDigest.js';

const routine = { id: 'r-1', title: 'Weekly corporate research ingest' };

beforeEach(() => vi.clearAllMocks());

describe('sendReviewQueueDigest', () => {
  it('sends nothing when nothing is waiting', async () => {
    // A message always means something happened.
    const result = await sendReviewQueueDigest(routine, [
      { legalName: 'Strategy Inc', slug: 'strategy', queuedRows: 0 },
    ]);

    expect(result).toBeNull();
    expect(h.deliverTeamEmail).not.toHaveBeenCalled();
  });

  it('sends one message naming only the records with rows waiting', async () => {
    await sendReviewQueueDigest(routine, [
      { legalName: 'Strategy Inc', slug: 'strategy', queuedRows: 2 },
      { legalName: 'Sequans', slug: 'sequans', queuedRows: 0 },
    ]);

    expect(h.deliverTeamEmail).toHaveBeenCalledTimes(1);
    const [, message] = h.deliverTeamEmail.mock.calls[0] as unknown as [
      unknown,
      { subject: string; text: string },
    ];
    expect(message.subject).toBe('Corporate research: 2 rows to review on 1 record');
    expect(message.text).toContain('Strategy Inc');
    expect(message.text).not.toContain('Sequans');
  });
});
