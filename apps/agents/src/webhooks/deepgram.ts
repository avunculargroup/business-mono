import { mastra } from '../mastra/index.js';

export async function handleDeepgramWebhook(req: Request): Promise<Response> {
  const event = await req.json() as DeepgramCallbackEvent;

  const { metadata, results } = event;
  const requestId = metadata?.request_id;

  if (!requestId) {
    return new Response('Missing request_id', { status: 400 });
  }

  // Build speaker-labelled transcript
  const transcript = buildTranscript(results);

  // Resume the suspended Recorder workflow instance that's waiting on this request_id
  await mastra.getWorkflow('recorder').resume({
    resumeId: requestId,
    context: {
      transcript,
      requestId,
      channels: results.channels,
    },
  });

  return new Response('OK', { status: 200 });
}

function buildTranscript(results: DeepgramResults): string {
  const utterances = results.utterances ?? [];

  return utterances
    .map((u) => {
      const speaker = u.channel !== undefined
        ? `Channel ${u.channel}`
        : `Speaker ${u.speaker}`;
      return `[${speaker}] ${u.transcript}`;
    })
    .join('\n');
}

interface DeepgramCallbackEvent {
  metadata: {
    request_id: string;
    [key: string]: unknown;
  };
  results: DeepgramResults;
}

interface DeepgramResults {
  channels: unknown;
  utterances?: Array<{
    transcript: string;
    speaker?: number;
    channel?: number;
    start: number;
    end: number;
  }>;
}
