import { logActivity } from '../../tools/activity.js';
import { storeAvailableTranscript, updateEpisode } from './store.js';
import type { TimedSegment } from './parsers.js';
import { createLogger } from '../logger.js';

const log = createLogger('podcast-transcript');

// Subset of the Deepgram callback payload we consume — utterances carry per-line
// timing and a speaker index (single-channel diarisation).
export interface DeepgramResults {
  utterances?: Array<{
    transcript: string;
    speaker?: number;
    channel?: number;
    start: number;
    end: number;
  }>;
}

function buildTimedSegments(results: DeepgramResults): TimedSegment[] {
  return (results.utterances ?? [])
    .filter((u) => u.transcript?.trim())
    .map((u) => ({
      start: u.start,
      end: u.end,
      speaker: u.speaker !== undefined ? `Speaker ${u.speaker}` : null,
      text: u.transcript.trim(),
    }));
}

/**
 * Resolve a podcast episode from a Deepgram async callback. Builds timestamped
 * segments from the utterances, stores the transcript as `available` (source
 * `deepgram`), embeds it, and logs to agent_activity. On failure, marks the
 * episode `failed` so it surfaces in v_episodes_awaiting_action for Simon. This
 * is a plain async function — no workflow/suspend, since the work is linear and
 * has no human gates (the batch deliberately doesn't hold a suspended run).
 */
export async function processPodcastTranscript(
  episodeId: string,
  results: DeepgramResults,
): Promise<void> {
  let embedded: number;
  try {
    const segments = buildTimedSegments(results);
    if (segments.length === 0) {
      await updateEpisode(episodeId, {
        transcript_status: 'failed',
        transcript_error: 'Deepgram returned no utterances',
      });
      return;
    }

    const text = segments
      .map((s) => (s.speaker ? `[${s.speaker}] ${s.text}` : s.text))
      .join('\n')
      .trim();

    ({ segments: embedded } = await storeAvailableTranscript(episodeId, {
      source: 'deepgram',
      format: null,
      language: null,
      text,
      segments,
      hasTimestamps: true,
    }));
  } catch (err) {
    await updateEpisode(episodeId, {
      transcript_status: 'failed',
      transcript_error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // The transcript is stored and embedded — the episode is already 'available'.
  // Logging is a best-effort audit write; a failure here (e.g. a rejected
  // trigger_type) must never demote a good transcript back to 'failed', which is
  // exactly the bug that hid completed Deepgram transcripts behind a 'failed'
  // status. Swallow logging errors instead. triggerType is 'scheduled' — the
  // podcast batch is routine-driven and 'webhook' is not an allowed trigger_type.
  try {
    await logActivity.execute!(
      {
        agentName: 'archie',
        action: `Podcast transcript ready (Deepgram): ${embedded} segments embedded`,
        status: 'auto',
        triggerType: 'scheduled',
        entityType: 'podcast_episode',
        entityId: episodeId,
      } as never,
      {} as never,
    );
  } catch (err) {
    log.warn({ err, episodeId }, 'activity log failed (transcript is stored)');
  }
}
