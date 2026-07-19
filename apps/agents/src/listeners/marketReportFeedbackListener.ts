import { supabase, createRealtimeClient } from '@platform/db';
import { editor } from '../agents/editorial/index.js';
import { stepRequestContext } from '../config/model.js';
import { normalizeGuidelines } from '../workflows/socialPost/distill.js';
import {
  buildReportDistillPrompt,
  distilledReportGuidelinesSchema,
  type ReportFeedbackItem,
} from '../lib/findings/reportDistill.js';
import { subscribeWithReconnect } from './lib/realtimeChannel.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('report-feedback-distill');

// Distills founder feedback on market-report narrations into the standing
// guideline list the findings narrator injects (market_report_guidelines
// singleton). The /market-reports/[id] review page inserts
// market_report_feedback rows; this listener reacts via Supabase Realtime,
// atomically claims undistilled rows (distilled_at is the claim column), asks
// the editor to fold them in, and upserts the result. A startup sweep catches
// feedback submitted while the listener was down. Sibling of
// feedbackDistillListener.ts (per-account social guidelines).

const realtime = createRealtimeClient();

// market_report_feedback / market_report_guidelines are not in the generated
// Database types yet — cast to bypass typing, same as feedbackDistillListener.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

interface ClaimedRow extends ReportFeedbackItem {
  id: string;
}

/** Reset claimed rows so the next insert or startup sweep retries them. */
async function unclaimRows(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from('market_report_feedback')
    .update({ distilled_at: null })
    .in('id', ids);
  if (error) log.error({ error: error.message, ids }, 'unclaim failed — rows stay claimed');
}

/**
 * Distill all undistilled report feedback into the singleton guideline list.
 * Atomically claims the rows first (conditional update on distilled_at IS NULL)
 * so a concurrent event can't distill the same feedback twice. On any failure
 * after the claim, the rows are unclaimed for retry. Exported for unit testing
 * and the startup sweep.
 */
export async function distillReportFeedback(): Promise<void> {
  const { data: claimed, error: claimErr } = await db
    .from('market_report_feedback')
    .update({ distilled_at: new Date().toISOString() })
    .is('distilled_at', null)
    .select('id, verdict, feedback, narration_excerpt');
  if (claimErr) {
    log.error({ error: claimErr.message }, 'claim failed');
    return;
  }
  const rows = (claimed ?? []) as ClaimedRow[];
  if (rows.length === 0) return; // another handler already claimed the batch

  const claimedIds = rows.map((r) => r.id);
  try {
    const { data: existing, error: glErr } = await db
      .from('market_report_guidelines')
      .select('guidelines')
      .eq('id', 1)
      .maybeSingle();
    if (glErr) throw new Error(`market_report_guidelines lookup failed: ${glErr.message}`);

    const currentGuidelines = normalizeGuidelines(existing?.guidelines);
    const prompt = buildReportDistillPrompt({ currentGuidelines, feedbackItems: rows });

    const response = await editor.generate([{ role: 'user', content: prompt }], {
      requestContext: stepRequestContext('market_report.distill_feedback'),
      structuredOutput: { schema: distilledReportGuidelinesSchema, errorStrategy: 'fallback', fallbackValue: null },
    });
    const parsed = response.object ? distilledReportGuidelinesSchema.parse(response.object) : null;
    if (!parsed) throw new Error('distillation returned no structured output');

    const guidelines = normalizeGuidelines(parsed.guidelines);
    const { error: upsertErr } = await db.from('market_report_guidelines').upsert({
      id: 1,
      guidelines,
      updated_at: new Date().toISOString(),
      updated_by: null,
    });
    if (upsertErr) throw new Error(`guidelines upsert failed: ${upsertErr.message}`);

    log.info({ feedbackCount: rows.length, guidelineCount: guidelines.length }, 'distilled');
  } catch (err) {
    log.error({ err }, 'distill failed — unclaiming for retry');
    await unclaimRows(claimedIds);
  }
}

/**
 * Startup sweep: distill any feedback left unclaimed while the listener was
 * down. Non-fatal — a failure here never blocks startup.
 */
export async function backfillUndistilledReportFeedback(): Promise<void> {
  try {
    const { data: rows, error } = await db
      .from('market_report_feedback')
      .select('id')
      .is('distilled_at', null)
      .limit(1);
    if (error) throw new Error(`market_report_feedback select failed: ${error.message}`);
    if ((rows ?? []).length > 0) await distillReportFeedback();
  } catch (err) {
    log.error({ err }, 'backfill failed (non-fatal)');
  }
}

/**
 * Subscribe to market_report_feedback inserts and fold new feedback into the
 * standing narration guideline list.
 */
export function startMarketReportFeedbackListener(): void {
  void backfillUndistilledReportFeedback();
  subscribeWithReconnect({
    client: realtime,
    channelName: 'report-feedback-distill',
    logPrefix: '[report-feedback-distill]',
    onSubscribed: () => {
      log.info('listening for market report feedback via Supabase Realtime');
    },
    attachHandlers: (channel) =>
      channel.on(
        'postgres_changes' as never,
        { event: 'INSERT', schema: 'public', table: 'market_report_feedback' },
        async () => {
          try {
            await distillReportFeedback();
          } catch (err) {
            log.error({ err }, 'error handling report feedback insert');
          }
        },
      ),
  });
}
