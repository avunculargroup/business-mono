/**
 * Emails the team the records a scheduled research ingest left draft rows on.
 *
 * Same transport, sender and recipients as the news digest (`deliverTeamEmail`).
 * Suppressed when nothing is waiting: a message always means something
 * happened, which is what keeps people opening it. Best-effort and never
 * throws, so email can never fail the routine.
 *
 * Env:
 *   WEB_APP_URL   Absolute base for the record and queue links (optional)
 */

import { renderReviewQueueEmail, type ReviewQueueEntry } from './reviewQueueEmail.js';
import {
  deliverTeamEmail,
  loadCompanyFooter,
  type DigestDeliveryResult,
  type DigestRoutineRef,
} from './sendNewsDigest.js';

export async function sendReviewQueueDigest(
  routine: DigestRoutineRef,
  entries: ReviewQueueEntry[],
): Promise<DigestDeliveryResult | null> {
  const waiting = entries.filter((entry) => entry.queuedRows > 0);
  if (waiting.length === 0) return null;

  const company = await loadCompanyFooter();
  return deliverTeamEmail(
    routine,
    renderReviewQueueEmail({ entries: waiting, webAppUrl: process.env['WEB_APP_URL'], company }),
  );
}
