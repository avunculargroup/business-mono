import { createRealtimeClient } from '@platform/db';
import { parseEpisodeAction, reResolveEpisode } from '../lib/transcripts/reResolve.js';
import { runEpisodeIntel } from '../workflows/podcastIntel/index.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('podcast-action');

// Web path for per-episode re-run actions. The /news/podcasts pages can't reach
// the agents server over HTTP, so they write the requested action to
// podcast_episodes.pending_action; this listener reacts via Supabase Realtime
// and re-runs the transcript waterfall for that one episode — the podcast mirror
// of newsletterGateWeb.ts.

const supabase = createRealtimeClient();

// Realtime postgres_changes only delivers events that occur while the channel is
// SUBSCRIBED, and reconcile otherwise runs only on (re)connect — so a web action
// whose event is missed with no subsequent reconnect sits unclaimed forever, and
// a brief whose run was claimed but never finished sits in 'generating' forever.
// A periodic sweep is the safety net: independent of channel health it re-runs
// any unclaimed pending_action and fails stale 'generating' rows.
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// A brief 'generating' longer than this whose pending_action has already been
// cleared is treated as orphaned — the run was claimed (which nulls
// pending_action) but the process crashed, redeployed, or the model call hung
// before it could resolve the status. Generous enough not to trip a legitimately
// slow in-flight pass (a single narrate + compliance + scoring pass is minutes,
// not tens of minutes).
const STALE_GENERATING_MS = 15 * 60 * 1000; // 15 minutes

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

  // 'summarize' runs the episode-intelligence pass; the rest re-run the
  // transcript waterfall. Classify before the claim so an unknown action is
  // still claimed (cleared) but not dispatched.
  const action = row.pending_action;
  const parsed = action === 'summarize' ? null : parseEpisodeAction(action);

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

  if (action === 'summarize') {
    log.info({ rowId: row.id }, 'summarizing');
    await runEpisodeIntel(row.id);
    return;
  }

  if (!parsed) {
    log.error({ rowId: row.id, action }, 'unknown action');
    return;
  }

  log.info({ rowId: row.id, action }, 're-resolving');
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
 * Fail briefs stuck in 'generating' past STALE_GENERATING_MS whose pending_action
 * has already been cleared — i.e. the run was claimed but never resolved the
 * status (crash, redeploy, or a hung model call). Flipping them to 'failed'
 * surfaces the episode page's retry affordance instead of an indefinite
 * "Generating…". Rows that still carry a pending_action are deliberately left to
 * reconcilePendingActions, which re-runs (rather than fails) them. Exported for
 * unit testing.
 */
export async function failStaleGeneratingBriefs(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as unknown as { from: (t: string) => any };
  const cutoff = new Date(Date.now() - STALE_GENERATING_MS).toISOString();
  const { data, error } = await db
    .from('podcast_episodes')
    .update({ summary_status: 'failed' })
    .eq('summary_status', 'generating')
    .is('pending_action', null)
    .lt('updated_at', cutoff)
    .select('id');
  if (error) {
    log.error({ error: error.message }, 'failed to sweep stale generating briefs');
    return;
  }
  if (data && data.length > 0) {
    log.warn(
      { count: data.length, ids: (data as { id: string }[]).map((r) => r.id) },
      'failed stale generating briefs',
    );
  }
}

/**
 * One reconcile pass: catch up on unclaimed pending_action rows (missed Realtime
 * events / actions written while disconnected), then fail any orphaned
 * 'generating' briefs. Run on every (re)connect and on a periodic timer so
 * recovery never depends on a single Realtime event landing. Exported for unit
 * testing.
 */
export async function reconcile(): Promise<void> {
  await reconcilePendingActions();
  await failStaleGeneratingBriefs();
}

/**
 * Subscribe to podcast_episodes and re-run the waterfall for any episode whose
 * web-requested action has been written to pending_action.
 */
export function startPodcastActionListener(): void {
  // Periodic safety net: recover missed events and orphaned 'generating' rows
  // even if the Realtime channel never cycles to trigger an onSubscribed sweep.
  setInterval(() => void reconcile(), RECONCILE_INTERVAL_MS);
  subscribeWithReconnect({
    client: supabase,
    channelName: 'podcast-action',
    logPrefix: '[podcast-action]',
    onSubscribed: () => {
      log.info('listening for episode re-run actions via Supabase Realtime');
      // Catch up on anything missed while the subscription was down.
      void reconcile();
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
