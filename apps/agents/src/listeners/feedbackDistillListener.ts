import { supabase, createRealtimeClient } from '@platform/db';
import { editor } from '../agents/editorial/index.js';
import { stepRequestContext } from '../config/model.js';
import {
  buildDistillPrompt,
  distilledGuidelinesSchema,
  normalizeGuidelines,
  type FeedbackItem,
} from '../workflows/socialPost/distill.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('feedback-distill');

// Distills founder feedback on social drafts into durable per-account
// guidelines. The /content/[id] review page inserts content_feedback rows; this
// listener reacts via Supabase Realtime, atomically claims the account's
// undistilled rows (distilled_at is the claim column), asks the editor to fold
// them into the current account_feedback_guidelines list, and upserts the
// result. A startup sweep catches feedback submitted while the listener was
// down. The social_post routine only READS the guidelines table — no LLM step
// is added to the generation path.

const realtime = createRealtimeClient();

// content_feedback / account_feedback_guidelines are not in the generated
// Database types yet — cast to bypass typing, same as the socialPost handler.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ClaimedRow extends FeedbackItem {
  id: string;
}

export interface ContentFeedbackRow {
  social_account_id: string;
}

/** Reset claimed rows so the next insert or startup sweep retries them. */
async function unclaimRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from('content_feedback')
    .update({ distilled_at: null })
    .in('id', ids);
  if (error) log.error({ error: error.message, ids }, 'unclaim failed — rows stay claimed');
}

/**
 * Distill all undistilled feedback for one account into its guideline list.
 * Atomically claims the rows first (conditional update on distilled_at IS NULL)
 * so the LinkedIn+X double-submit burst or a concurrent event can't distill the
 * same feedback twice. On any failure after the claim, the rows are unclaimed
 * for retry. Exported for unit testing and the startup sweep.
 */
export async function distillAccountFeedback(accountId: string): Promise<void> {
  const { data: claimed, error: claimErr } = await db
    .from('content_feedback')
    .update({ distilled_at: new Date().toISOString() })
    .eq('social_account_id', accountId)
    .is('distilled_at', null)
    .select('id, verdict, feedback, post_form, draft_excerpt');
  if (claimErr) {
    log.error({ error: claimErr.message, accountId }, 'claim failed');
    return;
  }
  const rows = (claimed ?? []) as ClaimedRow[];
  if (rows.length === 0) return; // another handler already claimed the batch

  const claimedIds = rows.map((r) => r.id);
  try {
    const { data: account, error: accErr } = await db
      .from('social_accounts')
      .select('display_name, platform')
      .eq('id', accountId)
      .maybeSingle();
    if (accErr) throw new Error(`social_accounts lookup failed: ${accErr.message}`);
    if (!account) throw new Error(`social_account ${accountId} not found`);

    const { data: existing, error: glErr } = await db
      .from('account_feedback_guidelines')
      .select('guidelines')
      .eq('social_account_id', accountId)
      .maybeSingle();
    if (glErr) throw new Error(`account_feedback_guidelines lookup failed: ${glErr.message}`);

    const currentGuidelines = normalizeGuidelines(existing?.guidelines);
    const prompt = buildDistillPrompt({
      accountLabel: (account.display_name as string | null) ?? 'this founder',
      platform: account.platform as string,
      currentGuidelines,
      feedbackItems: rows,
    });

    const response = await editor.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('social_post.distill_feedback'),
      structuredOutput: { schema: distilledGuidelinesSchema, errorStrategy: 'fallback', fallbackValue: null },
    });
    const parsed = response.object ? distilledGuidelinesSchema.parse(response.object) : null;
    if (!parsed) throw new Error('distillation returned no structured output');

    const guidelines = normalizeGuidelines(parsed.guidelines);
    const { error: upsertErr } = await db.from('account_feedback_guidelines').upsert({
      social_account_id: accountId,
      guidelines,
      updated_at: new Date().toISOString(),
      updated_by: null,
    });
    if (upsertErr) throw new Error(`guidelines upsert failed: ${upsertErr.message}`);

    log.info({ accountId, feedbackCount: rows.length, guidelineCount: guidelines.length }, 'distilled');
  } catch (err) {
    log.error({ err, accountId }, 'distill failed — unclaiming for retry');
    await unclaimRows(claimedIds);
  }
}

/**
 * Startup sweep: distill any feedback left unclaimed while the listener was
 * down. Bounded and non-fatal — a failure here never blocks startup.
 */
export async function backfillUndistilledFeedback(): Promise<void> {
  try {
    const { data: rows, error } = await db
      .from('content_feedback')
      .select('social_account_id')
      .is('distilled_at', null)
      .limit(200);
    if (error) throw new Error(`content_feedback select failed: ${error.message}`);

    const accountIds = [...new Set(((rows ?? []) as ContentFeedbackRow[]).map((r) => r.social_account_id))];
    for (const accountId of accountIds) {
      await distillAccountFeedback(accountId);
    }
    if (accountIds.length > 0) log.info({ accounts: accountIds.length }, 'backfill complete');
  } catch (err) {
    log.error({ err }, 'backfill failed (non-fatal)');
  }
}

/**
 * Subscribe to content_feedback inserts and fold each account's new feedback
 * into its standing guideline list.
 */
export function startFeedbackDistillListener(): void {
  void backfillUndistilledFeedback();
  subscribeWithReconnect({
    client: realtime,
    channelName: 'feedback-distill',
    logPrefix: '[feedback-distill]',
    onSubscribed: () => {
      log.info('listening for draft feedback via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'content_feedback' },
        async (payload: { new: ContentFeedbackRow }) => {
          try {
            if (!payload.new?.social_account_id) return;
            await distillAccountFeedback(payload.new.social_account_id);
          } catch (err) {
            log.error({ err }, 'error handling feedback insert');
          }
        },
      ),
  });
}
