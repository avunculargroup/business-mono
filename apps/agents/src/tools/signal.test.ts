import { describe, it, expect, vi } from 'vitest';

const sendMessage = vi.fn();
const receiveMessages = vi.fn();

vi.mock('@platform/signal', () => ({
  SignalClient: vi.fn().mockImplementation(() => ({
    sendMessage,
    receiveMessages,
  })),
}));

const { signalSend, signalReceive } = await import('./signal.js');

describe('signalSend', () => {
  it('forwards recipient and message to SignalClient.sendMessage', async () => {
    sendMessage.mockResolvedValueOnce({ timestamp: 1700000000000 });
    const result = await signalSend.execute!(
      { recipient: '+15551234567', message: 'hello' } as never,
      {} as never,
    );
    expect(sendMessage).toHaveBeenCalledWith({
      recipients: ['+15551234567'],
      message: 'hello',
    });
    expect(result).toEqual({ sent: true, timestamp: 1700000000000 });
  });

  it('propagates errors from the Signal client', async () => {
    sendMessage.mockRejectedValueOnce(new Error('signal-cli unreachable'));
    await expect(
      signalSend.execute!({ recipient: '+1', message: 'x' } as never, {} as never),
    ).rejects.toThrow(/signal-cli unreachable/);
  });
});

describe('signalReceive', () => {
  it('returns whatever the client returns', async () => {
    receiveMessages.mockResolvedValueOnce([{ id: 'm1' }, { id: 'm2' }]);
    const result = await signalReceive.execute!({} as never, {} as never);
    expect(result).toEqual({ messages: [{ id: 'm1' }, { id: 'm2' }] });
  });
});
