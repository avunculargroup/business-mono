import { z } from 'zod';
import { supabase } from '@platform/db';
import { roger } from '../../agents/recorder/agent.js';
import { stepRequestContext } from '../../config/model.js';
import { createLogger } from '../logger.js';
import type { TimedSegment } from './parsers.js';

const log = createLogger('podcast-speakers');

// Only apply an inferred name when the model is at least this confident; below
// this we keep the generic "Speaker N" label rather than assert a wrong name.
const MIN_CONFIDENCE = 0.6;

// Cap the transcript slice sent to the model. Speaker introductions ("I'm joined
// by…") land in the opening minutes, and the episode description usually names the
// participants outright — so the head plus the description is the strongest,
// cheapest signal even on a multi-hour episode.
const TRANSCRIPT_SAMPLE_CHARS = 8000;

export const speakerNamesSchema = z.object({
  speakers: z
    .array(
      z.object({
        label: z.string(),
        name: z.string(),
        confidence: z.number(),
      }),
    )
    .default([]),
});

export interface SpeakerEpisode {
  title: string;
  description: string | null;
}

/** Build the speaker-identification prompt. Pure — unit-tested. */
export function buildSpeakerPrompt(episode: SpeakerEpisode, transcriptSample: string): string {
  return `You are labelling a diarised podcast transcript. The transcript uses generic speaker labels like "Speaker 0", "Speaker 1". Identify the real name of each speaker using ONLY the evidence in the episode metadata and transcript below.

Episode title: ${episode.title}
Episode description: ${episode.description ?? '(none)'}

Transcript (start):
${transcriptSample}

For each speaker label you can confidently name, return { "label": "Speaker 0", "name": "Jane Doe", "confidence": 0.0-1.0 }. If you cannot tell who a speaker is, omit that label — do not guess. Only return labels that appear in the transcript.`;
}

/**
 * Rewrite each segment's speaker label in place using `map` (label → real name).
 * Labels absent from the map keep their generic "Speaker N" value. Returns the
 * number of segments relabelled. Pure — unit-tested.
 */
export function applySpeakerNames(segments: TimedSegment[], map: Record<string, string>): number {
  let renamed = 0;
  for (const seg of segments) {
    if (seg.speaker && map[seg.speaker]) {
      seg.speaker = map[seg.speaker]!;
      renamed++;
    }
  }
  return renamed;
}

/**
 * Infer real speaker names for a diarised podcast transcript from the episode
 * description + transcript, and relabel the segments in place. Best-effort: the
 * caller wraps this so any failure leaves the generic "Speaker N" labels intact
 * rather than demoting a good transcript. Returns the number of segments
 * relabelled (0 when there is nothing to do).
 */
export async function inferAndApplySpeakerNames(
  episodeId: string,
  segments: TimedSegment[],
): Promise<number> {
  const labels = new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s));
  if (labels.size === 0) return 0;

  // podcast_episodes isn't in the generated DB types until post-migration regen,
  // so this read goes through a boundary cast (same pattern as store.ts).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('podcast_episodes')
    .select('title, description')
    .eq('id', episodeId)
    .single();
  const episode: SpeakerEpisode = {
    title: (data?.title as string) ?? '',
    description: (data?.description as string | null) ?? null,
  };

  const sample = segments
    .map((s) => (s.speaker ? `[${s.speaker}] ${s.text}` : s.text))
    .join('\n')
    .slice(0, TRANSCRIPT_SAMPLE_CHARS);

  const response = await roger.generate(
    [{ role: 'user', content: buildSpeakerPrompt(episode, sample) }],
    {
      requestContext: stepRequestContext('podcast_transcript.identify_speakers'),
      structuredOutput: {
        schema: speakerNamesSchema,
        errorStrategy: 'fallback',
        fallbackValue: { speakers: [] },
      },
    },
  );

  const parsed = speakerNamesSchema.parse(response.object ?? { speakers: [] });
  const map: Record<string, string> = {};
  for (const s of parsed.speakers) {
    const name = s.name.trim();
    if (name && s.confidence >= MIN_CONFIDENCE && labels.has(s.label)) {
      map[s.label] = name;
    }
  }

  const renamed = applySpeakerNames(segments, map);
  if (renamed > 0) {
    log.info({ episodeId, mapped: Object.keys(map).length }, 'speakers relabelled');
  }
  return renamed;
}
