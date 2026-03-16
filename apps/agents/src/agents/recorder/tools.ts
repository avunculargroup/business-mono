import { createTool } from '@mastra/core';
import { z } from 'zod';

const TELNYX_API_KEY = process.env['TELNYX_API_KEY'] ?? '';

export const telnyxDownload = createTool({
  id: 'telnyx_download',
  description: 'Download a Telnyx call recording from its URL',
  inputSchema: z.object({
    recordingUrl: z.string().describe('URL of the Telnyx recording'),
    callControlId: z.string().describe('Telnyx call control ID for this recording'),
  }),
  execute: async ({ context }) => {
    const response = await fetch(context.recordingUrl, {
      headers: {
        Authorization: `Bearer ${TELNYX_API_KEY}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download Telnyx recording: ${response.statusText}`);
    }

    // Return the publicly accessible URL for Deepgram to fetch
    // In production, you'd upload to a temporary S3/R2 bucket and return a signed URL
    return {
      audioUrl: context.recordingUrl,
      callControlId: context.callControlId,
    };
  },
});
