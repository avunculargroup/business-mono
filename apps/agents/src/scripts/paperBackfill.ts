import { createLogger } from '../lib/logger.js';
import { listWorks } from '../workflows/papers/openalex.js';
import { defaultDeps, resolvePaper } from '../workflows/papers/resolve.js';
import { defaultWatchDeps, runWatches, watchFilter } from '../workflows/papers/watch.js';

const log = createLogger('backfill:papers');

/**
 * Seed the papers register from each active watch's full history. Spec:
 * docs/features/client-app/library-papers-spec.md#ingestion-and-watch-pipeline
 * (paperBackfill).
 *
 * The spec reads the OpenAlex CC0 snapshot from S3; this reads the API with the
 * same filter instead. The snapshot is hundreds of gigabytes to find the
 * 8,000–15,000 works one filter returns in about 75 pages of 200, which sits
 * well inside the daily allowance (see the build-progress doc).
 *
 * Resumable: works already in the register are skipped, so re-running after a
 * budget-limited pass resolves only what is left. --no-rex skips the Rex
 * confirmation and keeps each work's deterministic band (recorded as
 * rex_status 'unavailable'), for a cheap first pass a later run can confirm.
 *
 * Requires SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENALEX_API_KEY, and
 * ANTHROPIC_API_KEY unless --no-rex, with 20261019100000_paper_resolve applied.
 *
 *   pnpm --filter @platform/agents backfill:papers --dry-run
 *   pnpm --filter @platform/agents backfill:papers --limit 200 --no-rex
 *   pnpm --filter @platform/agents backfill:papers --watch <paper_watches.id>
 */

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main() {
  const limit = Number(arg('limit') ?? 500);
  const watchId = arg('watch');
  const noRex = flag('no-rex');

  if (flag('dry-run')) {
    for (const w of await defaultWatchDeps.loadWatches()) {
      if (watchId && w.id !== watchId) continue;
      const filter = watchFilter(w, null);
      if (!filter) {
        log.info({ watch: w.name, type: w.watch_type }, 'no runner for this watch type');
        continue;
      }
      const page = await listWorks(filter, '*', fetch, 1);
      log.info({ watch: w.name, filter, works: page.count }, 'would read');
    }
    return;
  }

  const resolveDeps = noRex ? { ...defaultDeps, confirmRelevance: async () => null } : defaultDeps;
  const result = await runWatches(
    { maxResolve: limit, ignoreHighWater: true, watchId: watchId ?? undefined },
    { ...defaultWatchDeps, resolve: (target) => resolvePaper(target, resolveDeps) },
  );
  log.info({ ...result, limit, noRex }, 'backfill pass done');
  if (result.deferred) log.info('more works remain: run again to continue');
}

main().catch((err) => {
  log.error({ err }, 'backfill failed');
  process.exit(1);
});
