import { supabase as db } from '@platform/db';
import type { ResearchIngestRoutineResult } from '@platform/shared';
import { createLogger } from '../../lib/logger.js';
import { sendReviewQueueDigest } from '../../lib/sendReviewQueueDigest.js';
import type { ResearchIngestOutput } from './schemas.js';

const log = createLogger('research-ingest-routine');

// mastra/index has top-level side effects (boots the server + listeners).
// Imported lazily so this module, and the routine dispatcher that imports it,
// do not drag those into unrelated loads. Mirrors variant/run.ts.
async function loadMastra() {
  return (await import('../../mastra/index.js')).mastra;
}

/** Start one researchIngest run for a record and wait for it to finish. */
export async function startResearchIngestRun(
  companyId: string,
): Promise<{ runId: string; status: string; result: ResearchIngestOutput | null }> {
  const mastra = await loadMastra();
  const run = await mastra.getWorkflow('researchIngest').createRun();
  const outcome = (await run.start({
    inputData: { companyId, requestedBy: null },
  })) as { status: string; result?: ResearchIngestOutput };
  return { runId: run.runId, status: outcome.status, result: outcome.result ?? null };
}

/**
 * The research_ingest routine: one run per record, in sequence, then one email
 * naming the records that were left draft rows.
 *
 * Sequential rather than parallel: each run fetches filings and calls three
 * models, and a register of a dozen records has no deadline that parallelism
 * would meet. A record whose run fails is named and skipped; the others still
 * run, and the routine still succeeds.
 */
export async function runResearchIngestRoutine(
  routine: { id: string; title: string },
  start: typeof startResearchIngestRun = startResearchIngestRun,
): Promise<{ summary: string; result: ResearchIngestRoutineResult }> {
  const { data, error } = await db
    .from('research_companies')
    .select('id, slug, legal_name')
    .neq('review_state', 'retired')
    .order('legal_name');
  if (error) throw error;
  const companies = (data ?? []) as Array<{ id: string; slug: string; legal_name: string }>;

  const queued: ResearchIngestRoutineResult['queued'] = [];
  const failed: string[] = [];
  const drafted: Array<{ slug: string; legal_name: string }> = [];

  for (const company of companies) {
    try {
      const run = await start(company.id);
      if (run.status !== 'success') {
        failed.push(company.slug);
        log.warn({ slug: company.slug, runId: run.runId, status: run.status }, 'ingest run did not succeed');
        continue;
      }
      const rows = run.result?.queuedRows ?? 0;
      if (rows > 0) queued.push({ slug: company.slug, legal_name: company.legal_name, queued_rows: rows });
      if (run.result?.summaryDrafted) drafted.push({ slug: company.slug, legal_name: company.legal_name });
    } catch (err) {
      failed.push(company.slug);
      log.error({ err, slug: company.slug }, 'ingest run failed');
    }
  }

  const delivery = await sendReviewQueueDigest(
    routine,
    queued.map((entry) => ({
      legalName: entry.legal_name,
      slug: entry.slug,
      queuedRows: entry.queued_rows,
    })),
  );

  const queuedRows = queued.reduce((sum, entry) => sum + entry.queued_rows, 0);
  const records = (n: number) => (n === 1 ? '1 record' : `${n} records`);
  const summary =
    (queuedRows > 0
      ? `${queuedRows === 1 ? '1 row' : `${queuedRows} rows`} waiting for review on ${records(queued.length)}: ` +
        // A legal name can end in its own full stop ("Inc."); don't add a second.
        `${queued.map((entry) => entry.legal_name).join(', ')}`.replace(/\.?$/, '.')
      : `Nothing to review: ${records(companies.length - failed.length)} ingested, nothing new or changed.`) +
    (drafted.length > 0
      ? ` Subscriber summary drafted for ${records(drafted.length)}: ` +
        `${drafted.map((entry) => entry.legal_name).join(', ')}`.replace(/\.?$/, '.')
      : '') +
    (failed.length > 0 ? ` ${records(failed.length)} failed: ${failed.join(', ')}.` : '');

  return {
    summary,
    result: {
      companies_run: companies.length,
      companies_failed: failed,
      queued_rows: queuedRows,
      queued,
      summaries_drafted: drafted.map((entry) => entry.slug),
      emailed: (delivery?.sent ?? 0) > 0,
      link_url: '/research?view=review',
      link_label: 'Review queue',
    },
  };
}
