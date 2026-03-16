import { createTool } from '@mastra/core';
import { z } from 'zod';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const SIGNAL_CLI = process.env['SIGNAL_CLI_PATH'] ?? 'signal-cli';
const SIGNAL_NUMBER = process.env['SIGNAL_PHONE_NUMBER'] ?? '';

export const signalSend = createTool({
  id: 'signal_send',
  description: 'Send a Signal message to a phone number',
  inputSchema: z.object({
    recipient: z.string().describe('Recipient phone number in E.164 format'),
    message: z.string().describe('Message body to send'),
  }),
  execute: async ({ context }) => {
    const { stdout, stderr } = await execFileAsync(SIGNAL_CLI, [
      '-u', SIGNAL_NUMBER,
      'send',
      '-m', context.message,
      context.recipient,
    ]);

    if (stderr) console.error('signal-cli stderr:', stderr);
    return { sent: true, output: stdout };
  },
});

export const signalReceive = createTool({
  id: 'signal_receive',
  description: 'Receive pending Signal messages',
  inputSchema: z.object({}),
  execute: async () => {
    const { stdout } = await execFileAsync(SIGNAL_CLI, [
      '-u', SIGNAL_NUMBER,
      'receive',
      '--output=json',
    ]);

    const lines = stdout.trim().split('\n').filter(Boolean);
    const messages = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);

    return { messages };
  },
});
