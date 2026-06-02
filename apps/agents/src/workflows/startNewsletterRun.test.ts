import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabaseClient } from '../../test/mocks/supabase.js';

// startNewsletterRun imports @platform/db and @platform/signal at module load;
// mock both so the unit under test (notifySignal) can be imported in isolation.
const fakeSupabase: FakeSupabaseClient = createFakeSupabase();
const sendMessage = vi.fn();

vi.mock('@platform/db', () => ({ get supabase() { return fakeSupabase; } }));
vi.mock('@platform/signal', () => ({
  SignalClient: vi.fn().mockImplementation(() => ({ sendMessage })),
}));

const { notifySignal } = await import('./startNewsletterRun.js');

describe('notifySignal', () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('forwards the params to SignalClient.sendMessage', async () => {
    sendMessage.mockResolvedValueOnce({ timestamp: 1 });
    await notifySignal({ recipients: ['+15551234567'], message: 'hi' });
    expect(sendMessage).toHaveBeenCalledWith({ recipients: ['+15551234567'], message: 'hi' });
  });

  it('swallows a send failure so a bad recipient never aborts run handling', async () => {
    sendMessage.mockRejectedValueOnce(
      new Error('signal-cli API error 400: User +61390226516 is not registered.'),
    );
    // Must resolve, not reject — the gate notification is best-effort.
    await expect(
      notifySignal({ recipients: ['+61390226516'], message: 'gate prompt' }),
    ).resolves.toBeUndefined();
  });
});
