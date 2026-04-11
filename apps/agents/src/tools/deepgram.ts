import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createClient } from '@deepgram/sdk';

const deepgram = createClient(process.env['DEEPGRAM_API_KEY'] ?? '');

export const deepgramTranscribe = createTool({
  id: 'deepgram_transcribe',
  description: 'Submit an audio file to Deepgram for transcription and return a request_id',
  inputSchema: z.object({
    audioUrl: z.string().describe('Public URL of the audio file'),
    callbackUrl: z.string().describe('Webhook URL for Deepgram to POST results to'),
    multichannel: z.boolean().default(false).describe('True for dual-channel Telnyx calls'),
    diarize: z.boolean().default(true).describe('Enable speaker diarisation for single-channel'),
  }),
  execute: async (context) => {
    const options: Record<string, unknown> = {
      model: 'nova-3',
      punctuate: true,
      utterances: true,
      callback: context.callbackUrl,
    };

    if (context.multichannel) {
      options['multichannel'] = true;
    } else if (context.diarize) {
      options['diarize'] = true;
    }

    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
      { url: context.audioUrl },
      options as Parameters<typeof deepgram.listen.prerecorded.transcribeUrl>[1]
    );

    if (error) throw new Error(`Deepgram transcription failed: ${String(error)}`);

    const requestId = result?.metadata?.request_id ?? '';
    return { requestId };
  },
});
