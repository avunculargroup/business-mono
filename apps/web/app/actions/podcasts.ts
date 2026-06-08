'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

const REVALIDATE = '/news/podcasts';

// The per-row re-run actions written to podcast_episodes.pending_action. The
// agents server's podcastActionListener reacts via Supabase Realtime and
// re-runs the transcript waterfall — the web app can't reach it over HTTP.
const EPISODE_ACTIONS = ['refetch', 'deepgram', 'retry'] as const;
type EpisodeAction = (typeof EPISODE_ACTIONS)[number];

export async function requestEpisodeAction(id: string, action: EpisodeAction) {
  if (!EPISODE_ACTIONS.includes(action)) return { error: 'Unknown action.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('podcast_episodes')
    // pending_action is picked up by the listener; resolving reflects the
    // in-flight state immediately in the UI. (pending_action is post-migration,
    // so cast at the boundary like the agents code does.)
    .update({ pending_action: action, transcript_status: 'resolving', transcript_error: null } as never)
    .eq('id', id);

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  revalidatePath(`/news/podcasts/${id}`);
  return { success: true };
}

const briefSchema = z
  .object({
    title: z.string().trim().optional(),
    audio_url: z.string().trim().url('Audio URL must be a valid URL').optional().or(z.literal('')),
    youtube_url: z.string().trim().url('YouTube URL must be a valid URL').optional().or(z.literal('')),
    why: z.string().trim().min(1, 'Add a short note on why this is worth ingesting'),
    allow_deepgram: z.coerce.boolean().optional().default(false),
  })
  .refine((v) => (v.audio_url && v.audio_url !== '') || (v.youtube_url && v.youtube_url !== ''), {
    message: 'Provide an audio URL or a YouTube URL.',
    path: ['audio_url'],
  });

// Ad-hoc, one-off episode ingestion from the web ("Ingest an episode"). Inserts
// a brief-origin episode (no source) and flags it for the waterfall. Deepgram is
// opt-in here too, so a paid transcription only runs when explicitly allowed.
export async function ingestEpisodeBrief(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const parsed = briefSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.errors[0]?.message ?? 'Invalid input' };

  const input = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('podcast_episodes')
    .insert({
      source_id: null,
      guid: crypto.randomUUID(),
      title: input.title?.trim() || input.youtube_url || input.audio_url || 'Untitled episode',
      audio_url: input.audio_url || null,
      youtube_url: input.youtube_url || null,
      ingestion_origin: 'brief',
      curator_note: input.why,
      transcript_status: 'pending',
      pending_action: input.allow_deepgram ? 'deepgram' : 'refetch',
    } as never)
    .select('id')
    .single();

  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return { success: true, id: (data as { id: string }).id };
}
