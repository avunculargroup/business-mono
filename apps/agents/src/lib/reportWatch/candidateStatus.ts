/**
 * Candidate state transitions.
 *
 * All the writes to `report_candidates` that happen after discovery, in one
 * place, so the status machine is readable as a machine rather than inferred
 * from scattered `.update()` calls.
 *
 *   new ──> queued ──> fetching ──┬─> acquired   (report row written)
 *                                 ├─> duplicate  (content_hash already known)
 *                                 ├─> skipped    (a deliberate no, with a reason)
 *                                 └─> failed     (three attempts exhausted)
 *
 * `skipped` and `failed` are different on purpose: a skip is a decision we
 * would make again given the same inputs, so it is terminal and cheap to
 * re-derive. A failure is transient until proven otherwise, so it retries —
 * three times, then it stops, because a URL that has 500'd on three separate
 * days is not going to succeed on the fourth.
 */

import type { ReportCandidateStatus, ReportSkipReason } from '@platform/shared';
import { reportDb } from './db.js';
import { createLogger } from '../logger.js';

const log = createLogger('report-watch-candidate');

/** Attempts after which a candidate stops being retried. */
export const MAX_ATTEMPTS = 3;

export interface HeadFacts {
  http_status?: number | null;
  content_type?: string | null;
  content_length?: number | null;
  etag?: string | null;
  last_modified?: string | null;
}

async function patch(candidateId: string, row: Record<string, unknown>): Promise<void> {
  const { error } = await reportDb.from('report_candidates').update(row).eq('id', candidateId);
  if (error) log.error({ err: error, candidateId }, 'candidate status update failed');
}

export async function markStatus(
  candidateId: string,
  status: ReportCandidateStatus,
  extra: Record<string, unknown> = {},
): Promise<void> {
  await patch(candidateId, { status, ...extra });
}

/** Record what HEAD told us, whatever we decide to do with it. */
export async function recordHead(candidateId: string, facts: HeadFacts): Promise<void> {
  await patch(candidateId, { ...facts, last_attempt_at: new Date().toISOString() });
}

/** A deliberate no. Terminal — the same inputs would produce the same answer. */
export async function markSkipped(
  candidateId: string,
  reason: ReportSkipReason,
  facts: HeadFacts = {},
): Promise<void> {
  await patch(candidateId, {
    status: 'skipped',
    skip_reason: reason,
    ...facts,
    last_attempt_at: new Date().toISOString(),
  });
}

/**
 * A transient no. Increments `attempts` and only settles on `failed` once the
 * budget is spent, so a publisher having a bad afternoon is retried tomorrow
 * rather than written off.
 */
export async function markAttemptFailed(
  candidateId: string,
  attempts: number,
  message: string,
): Promise<'failed' | 'new'> {
  const next = attempts + 1;
  const status = next >= MAX_ATTEMPTS ? 'failed' : 'new';
  await patch(candidateId, {
    status,
    attempts: next,
    last_error: message.slice(0, 500),
    last_attempt_at: new Date().toISOString(),
  });
  return status;
}

export async function markAcquired(candidateId: string, reportId: string): Promise<void> {
  await patch(candidateId, {
    status: 'acquired',
    report_id: reportId,
    skip_reason: null,
    last_error: null,
    last_attempt_at: new Date().toISOString(),
  });
}

/**
 * The publisher moved a PDF we already hold. No further work is warranted — the
 * artefact is byte-identical, so re-extracting and re-embedding it would produce
 * the same rows at full cost.
 */
export async function markDuplicate(candidateId: string, reportId: string): Promise<void> {
  await patch(candidateId, {
    status: 'duplicate',
    report_id: reportId,
    last_attempt_at: new Date().toISOString(),
  });
}
