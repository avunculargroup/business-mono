import { createRealtimeClient } from '@platform/db';
import { parseEpisodeAction, reResolveEpisode } from '../lib/transcripts/reResolve.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('podcast-action');

// Web path for per-episode re-run actions. The /news/podcasts pages can't reach
// the agents server over HTTP, so they write the requested action to
// podcast_episodes.pending_action; this listener reacts via Supabase Realtime
// and re-runs the transcript waterfall for that one episode — the podcast mirror
// of newsletterGateWeb.ts.

const supabase = createRealtimeClient();

export interface EpisodeActionRow {
  id: string;
  pending_action: string | null;
}

/**
 * Handle one podcast_episodes row carrying a pending_action. Atomically claims
 * the action (conditional clear) so a concurrent listener — or the status write
 * the re-run itself emits — can't process it twice, then re-resolves the
 * episode. Exported for unit testing.
 */
export async function handleEpisodeActionRow(row: EpisodeActionRow): Promise<void> {
  if (row.pending_action == null) return;

  const parsed = parseEpisodeAction(row.pending_action);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };

  // Atomic claim: clear pending_action only if it's still set. No row affected
  // means another handler already claimed it — bail out.
  const { data: claimed } = await db
    .from('podcast_episodes')
    .update({ pending_action: null })
    .eq('id', row.id)
    .not('pending_action', 'is', null)
    .select('id');
  if (!claimed || claimed.length === 0) return;

  if (!parsed) {
    log.error({ rowId: row.id, action: row.pending_action }, 'unknown action');
    return;
  }

  log.info({ rowId: row.id, action: row.pending_action }, 're-resolving');
  await reResolveEpisode(row.id, parsed);
}

/**
 * Sweep for episodes whose pending_action was written while we were disconnected.
 * Realtime postgres_changes only delivers events that occur while the channel is
 * SUBSCRIBED, so any web action submitted during a CHANNEL_ERROR / socket-close
 * gap is dropped and the row sits in 'resolving' forever. Running this on every
 * (re)connect catches up on those missed rows; handleEpisodeActionRow's atomic
 * claim keeps it safe against a concurrently delivered Realtime event.
 * Exported for unit testing.
 */
export async function reconcilePendingActions(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const { data, error } = await db
    .from('podcast_episodes')
    .select('id, pending_action')
    .not('pending_action', 'is', null);
  if (error || !data) return;
  for (const row of data as EpisodeActionRow[]) {
    try {
      await handleEpisodeActionRow(row);
    } catch (err) {
      log.error({ err, rowId: row.id }, 'error reconciling episode action');
    }
  }
}

/**
 * Subscribe to podcast_episodes and re-run the waterfall for any episode whose
 * web-requested action has been written to pending_action.
 */
export function startPodcastActionListener(): void {
  subscribeWithReconnect({
    client: supabase,
    channelName: 'podcast-action',
    logPrefix: '[podcast-action]',
    onSubscribed: () => {
      log.info('listening for episode re-run actions via Supabase Realtime');
      // Catch up on any actions missed while the subscription was down.
      void reconcilePendingActions();
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: '*', schema: 'public', table: 'podcast_episodes' },
        async (payload: { eventType: string; new: EpisodeActionRow }) => {
          try {
            if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return;
            await handleEpisodeActionRow(payload.new);
          } catch (err) {
            log.error({ err }, 'error handling episode action');
          }
        },
      ),
  });
}
