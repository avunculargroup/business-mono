// ============================================================
// paperWatch — every active standing query, from its high-water mark
// ============================================================
// Runs as the daily paper_watch routine, and as the backfill (with no
// high-water mark). Each watch is an OpenAlex filter; every work it returns
// that the register does not already hold is resolved. A run that hits its
// resolve budget leaves the watch's high-water mark where it was, so the
// next run picks up what this one deferred.
// Spec: docs/features/client-app/library-papers-spec.md#ingestion-and-watch-pipeline

import { supabase } from '@platform/db';
import type { PaperWatchRoutineResult } from '@platform/shared';
import { createLogger } from '../../lib/logger.js';
import { listWorks, normaliseDoi, shortOpenAlexId, type OpenAlexWork } from './openalex.js';
import { resolvePaper, type ResolveResult, type ResolveTarget } from './resolve.js';

const log = createLogger('paper-watch');

// Works can be indexed weeks after their publication date, so each run looks
// back this far past the high-water mark. Already-held works are skipped, so
// the overlap costs list pages, not resolves.
const LOOKBACK_DAYS = 60;

export interface WatchRow {
  id: string;
  name: string;
  watch_type: string;
  config: unknown;
  high_water: string | null;
  hits_total: number;
  promoted_total: number;
}

/** The OpenAlex filter for a watch, or null for a watch type v1 does not run. */
export function watchFilter(watch: WatchRow, highWater: string | null): string | null {
  const c = (watch.config ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof c[k] === 'string' && c[k] ? (c[k] as string) : null);
  let base: string | null;
  switch (watch.watch_type) {
    case 'openalex_query': base = str('filter'); break;
    case 'venue': base = str('source_id') ? `primary_location.source.id:${shortOpenAlexId(str('source_id'))}` : null; break;
    case 'author': base = str('author_id') ? `authorships.author.id:${shortOpenAlexId(str('author_id'))}` : null; break;
    case 'cites': base = str('work_id') ? `cites:${shortOpenAlexId(str('work_id'))}` : null; break;
    // crossref_query and arxiv_category have no runner yet; they are reported as skipped.
    default: base = null;
  }
  if (!base) return null;
  if (!highWater) return base;
  const from = new Date(`${highWater.slice(0, 10)}T00:00:00Z`);
  from.setUTCDate(from.getUTCDate() - LOOKBACK_DAYS);
  return `${base},from_publication_date:${from.toISOString().slice(0, 10)}`;
}

export interface WatchDeps {
  loadWatches: () => Promise<WatchRow[]>;
  /** Of these works, the ones the register already holds (by OpenAlex id or DOI). */
  knownWorks: (works: OpenAlexWork[]) => Promise<Set<string>>;
  saveWatch: (id: string, values: Record<string, unknown>) => Promise<void>;
  listWorks: typeof listWorks;
  resolve: (target: ResolveTarget) => Promise<ResolveResult>;
  now: () => Date;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const defaultWatchDeps: WatchDeps = {
  loadWatches: async () => {
    const { data, error } = await db
      .from('paper_watches')
      .select('id, name, watch_type, config, high_water, hits_total, promoted_total')
      .eq('is_active', true)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as WatchRow[];
  },
  knownWorks: async (works) => {
    const oaIds = works.map((w) => shortOpenAlexId(w.id)).filter((x): x is string => x !== null);
    const dois = works.map((w) => normaliseDoi(w.doi)).filter((x): x is string => x !== null);
    const known = new Set<string>();
    if (oaIds.length) {
      const { data, error } = await db.from('papers').select('openalex_id').in('openalex_id', oaIds);
      if (error) throw error;
      for (const r of data ?? []) known.add(r.openalex_id);
    }
    if (dois.length) {
      const { data, error } = await db.from('papers').select('doi').in('doi', dois);
      if (error) throw error;
      for (const r of data ?? []) known.add(r.doi);
    }
    return known;
  },
  saveWatch: async (id, values) => {
    const { error } = await db.from('paper_watches').update(values).eq('id', id);
    if (error) throw error;
  },
  listWorks,
  resolve: (target) => resolvePaper(target),
  now: () => new Date(),
};

export interface WatchRunOptions {
  /** Resolve at most this many new works across all watches. `deferred` counts only the page the budget ran out on. */
  maxResolve: number;
  /** Backfill: ignore high-water marks and read each watch's full history. */
  ignoreHighWater?: boolean;
  /** Run only this watch. */
  watchId?: string;
  /**
   * Re-resolve works the register already holds, too. commit_paper_resolve
   * updates them in place and reclassifies only untouched candidates, so this
   * is how a classifier fix reaches papers already landed.
   */
  refresh?: boolean;
}

export async function runWatches(opts: WatchRunOptions, deps: WatchDeps = defaultWatchDeps): Promise<PaperWatchRoutineResult> {
  const result: PaperWatchRoutineResult = {
    watches_run: 0, works_seen: 0, new_works: 0, resolved: 0, promoted: 0, failed: 0, deferred: 0, skipped_watches: [],
  };
  let budget = opts.maxResolve;
  const watches = (await deps.loadWatches()).filter((w) => !opts.watchId || w.id === opts.watchId);

  for (const watch of watches) {
    const filter = watchFilter(watch, opts.ignoreHighWater ? null : watch.high_water);
    if (!filter) {
      result.skipped_watches.push(watch.name);
      continue;
    }
    result.watches_run += 1;
    let hits = 0;
    let promoted = 0;
    let complete = true;
    let outOfBudget = false;
    let cursor: string | null = '*';

    while (cursor) {
      const page = await deps.listWorks(filter, cursor);
      result.works_seen += page.results.length;
      const known = await deps.knownWorks(page.results);
      for (const work of page.results) {
        const oa = shortOpenAlexId(work.id);
        const doi = normaliseDoi(work.doi);
        const held = Boolean((oa && known.has(oa)) || (doi && known.has(doi)));
        if (held && !opts.refresh) continue;
        // Only a work new to the register counts toward the watch's yield.
        if (!held) {
          hits += 1;
          result.new_works += 1;
        }
        if (budget <= 0) {
          complete = false;
          outOfBudget = true;
          result.deferred += 1;
          continue;
        }
        budget -= 1;
        try {
          const r = await deps.resolve({ work, discoveredVia: watch.id });
          if (r.status === 'committed') {
            result.resolved += 1;
            if (!held && (r.relevanceTier === 'core' || r.relevanceTier === 'substantial')) promoted += 1;
          }
        } catch (err) {
          result.failed += 1;
          complete = false;
          log.error({ err, watch: watch.name, work: oa }, 'resolve failed');
        }
      }
      // Out of budget: stop paging. The rest stays behind the high-water mark.
      cursor = page.results.length && !outOfBudget ? page.nextCursor : null;
    }

    result.promoted += promoted;
    await deps.saveWatch(watch.id, {
      last_run_at: deps.now().toISOString(),
      hits_total: watch.hits_total + hits,
      promoted_total: watch.promoted_total + promoted,
      // Advance only on a complete run: deferred or failed works are still behind the mark.
      ...(complete ? { high_water: deps.now().toISOString().slice(0, 10) } : {}),
    });
  }
  log.info({ ...result }, 'paper watch run');
  return result;
}

/** The paper_watch routine. */
export async function runPaperWatchRoutine(
  config: { max_resolve_per_run?: number },
  deps: WatchDeps = defaultWatchDeps,
): Promise<{ summary: string; result: PaperWatchRoutineResult }> {
  const result = await runWatches({ maxResolve: config.max_resolve_per_run ?? 100 }, deps);
  const parts = [
    `${result.new_works} new ${result.new_works === 1 ? 'work' : 'works'} across ${result.watches_run} ${result.watches_run === 1 ? 'watch' : 'watches'}`,
    `${result.resolved} resolved, ${result.promoted} core or substantial`,
  ];
  if (result.deferred) parts.push(`${result.deferred} deferred to the next run`);
  if (result.failed) parts.push(`${result.failed} failed`);
  if (result.skipped_watches.length) parts.push(`skipped: ${result.skipped_watches.join(', ')}`);
  return { summary: `${parts.join('; ')}.`, result };
}
