import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createClient, CallbackUrl } from '@deepgram/sdk';

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
    // The callback URL must be passed via transcribeUrlCallback (the async
    // method) — NOT as a `callback` option to transcribeUrl, which is synchronous
    // and rejects a callback with "Callback cannot be provided as an option to a
    // synchronous transcription."
    const options: Record<string, unknown> = {
      model: 'nova-3',
      punctuate: true,
      utterances: true,
    };

    if (context.multichannel) {
      options['multichannel'] = true;
    } else if (context.diarize) {
      options['diarize'] = true;
    }

    const { result, error } = await deepgram.listen.prerecorded.transcribeUrlCallback(
      { url: context.audioUrl },
      new CallbackUrl(context.callbackUrl),
      options as Parameters<typeof deepgram.listen.prerecorded.transcribeUrlCallback>[2]
    );

    if (error) throw new Error(`Deepgram transcription failed: ${String(error)}`);

    // The async callback response returns request_id at the top level, not under
    // metadata (that's the synchronous shape).
    const requestId = result?.request_id ?? '';
    return { requestId };
  },
});
