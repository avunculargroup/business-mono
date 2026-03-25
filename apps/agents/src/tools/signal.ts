import { createTool } from '@mastra/core';
import { z } from 'zod';
import { SignalClient } from '@platform/signal';

const client = new SignalClient();

export const signalSend = createTool({
  id: 'signal_send',
  description: 'Send a Signal message to a phone number',
  inputSchema: z.object({
    recipient: z.string().describe('Recipient phone number in E.164 format'),
    message: z.string().describe('Message body to send'),
  }),
  execute: async ({ context }) => {
    const result = await client.sendMessage({
      recipients: [context.recipient],
      message: context.message,
    });
    return { sent: true, timestamp: result.timestamp };
  },
});

export const signalReceive = createTool({
  id: 'signal_receive',
  description: 'Receive pending Signal messages',
  inputSchema: z.object({}),
  execute: async () => {
    const messages = await client.receiveMessages();
    return { messages };
  },
});
