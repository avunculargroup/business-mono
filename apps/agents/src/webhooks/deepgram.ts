import { supabase } from '@platform/db';
import { mastra } from '../mastra/index.js';
import { processPodcastTranscript } from '../lib/transcripts/processPodcastTranscript.js';

export async function handleDeepgramWebhook(req: Request): Promise<Response> {
  const event = await req.json() as DeepgramCallbackEvent;

  const { metadata, results } = event;
  const requestId = metadata?.request_id;

  if (!requestId) {
    return new Response('Missing request_id', { status: 400 });
  }

  // Disambiguate: the same Deepgram callback endpoint serves two producers.
  // A podcast episode awaiting transcription is matched by deepgram_request_id
  // (the batch path doesn't suspend a workflow run). Anything else is a Recorder
  // run keyed on runId = request_id.
  // (podcast_episodes isn't in the generated DB types until post-migration regen.)
  const { data: episode } = await (supabase
    .from('podcast_episodes' as never)
    .select('id')
    .eq('deepgram_request_id' as never, requestId)
    .maybeSingle() as unknown as Promise<{ data: { id: string } | null }>);

  if (episode) {
    await processPodcastTranscript(episode.id, results);
    return new Response('OK', { status: 200 });
  }

  // Resume the suspended Recorder workflow run that's waiting on this request_id
  const transcript = buildTranscript(results);
  const workflow = mastra.getWorkflow('recorder');
  const run = await workflow.createRun({ runId: requestId });
  await run.resume({
    resumeData: {
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
