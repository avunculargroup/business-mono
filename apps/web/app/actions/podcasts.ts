'use server';

import { getAuthedClient } from '@/lib/action';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { humanizeError } from '@/lib/errors';

const REVALIDATE = '/news/podcasts';

// The per-row re-run actions written to podcast_episodes.pending_action. The
// agents server's podcastActionListener reacts via Supabase Realtime and
// re-runs the transcript waterfall — the web app can't reach it over HTTP.
const EPISODE_ACTIONS = ['refetch', 'deepgram', 'retry'] as const;
type EpisodeAction = (typeof EPISODE_ACTIONS)[number];

export async function requestEpisodeAction(id: string, action: EpisodeAction) {
  if (!EPISODE_ACTIONS.includes(action)) return { error: 'Unknown action.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('podcast_episodes')
    // pending_action is picked up by the listener; resolving reflects the
    // in-flight state immediately in the UI. (pending_action is post-migration,
    // so cast at the boundary like the agents code does.)
    .update({ pending_action: action, transcript_status: 'resolving', transcript_error: null })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };
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
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;

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
    })
    .select('id')
    .single();

  if (error) return { error: humanizeError(error) };
  revalidatePath(REVALIDATE);
  return { success: true, id: (data as { id: string }).id };
}

// Toggle a podcast source's Deepgram transcription setting from the feeds page.
// A plain DB flip on news_sources.transcribe_with_deepgram — the scan path reads
// it on the next run, so there's no agent round-trip.
export async function setDeepgramTranscription(id: string, enabled: boolean) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('news_sources')
    .update({ transcribe_with_deepgram: enabled })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };
  revalidatePath('/news/podcasts/feeds');
  return { success: true };
}

// ── Episode intelligence (Phase 1: summary) ──────────────────────────────────

// Request the episode-intelligence pass. Writes pending_action = 'summarize';
// the agents server's podcastActionListener claims it and runs roger → Lex →
// persist a `proposed` summary (the web app can't reach the agent server over
// HTTP). Also (re)generates when a proposed draft is rejected or revised.
export async function generateEpisodeBrief(id: string) {
  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase } = auth;
  const { error } = await supabase
    .from('podcast_episodes')
    .update({ pending_action: 'summarize' })
    .eq('id', id);

  if (error) return { error: humanizeError(error) };
  revalidatePath(`/news/podcasts/${id}`);
  return { success: true };
}

// Approve or reject a proposed summary (the publish-wall). Approval is a plain
// DB flip — no agent round-trip — since nothing runs after approval. Guarded to
// only act on a `proposed` draft so an empty summary can't be published.
export async function decideEpisodeBrief(id: string, decision: 'approve' | 'reject') {
  if (decision !== 'approve' && decision !== 'reject') return { error: 'Unknown decision.' };

  const auth = await getAuthedClient();
  if (!auth.ok) return { error: auth.error };
  const { supabase, user } = auth;
  const { data: current, error: readErr } = await supabase
    .from('podcast_episodes')
    .select('summary_status')
    .eq('id', id)
    .single();
  if (readErr) return { error: humanizeError(readErr) };
  if ((current as { summary_status?: string } | null)?.summary_status !== 'proposed') {
    return { error: 'This episode has no summary awaiting a decision.' };
  }

  const patch =
    decision === 'approve'
      ? {
          summary_status: 'approved',
          summary_approved_at: new Date().toISOString(),
          summary_approved_by: user.id,
        }
      : {
          summary_status: 'none',
          episode_summary: null,
          key_takeaways: [],
          chapters: [],
          summary_lex_verdict: null,
          summary_generated_at: null,
          summary_approved_at: null,
          summary_approved_by: null,
        };

  const { error } = await supabase
    .from('podcast_episodes')
    .update(patch)
    .eq('id', id);

  if (error) return { error: humanizeError(error) };
  revalidatePath(`/news/podcasts/${id}`);
  return { success: true };
}
