/**
 * The I/O half of headline resolution: the "taken" check against news_items,
 * and the step that applies the extraction model's fallback headline. The pure
 * rules live in @platform/shared (newsTitle.ts).
 */

import { supabase } from '@platform/db';
import {
  cleanNewsTitle,
  isGenericTitle,
  resolveHeadline,
  titleFromSlug,
  type HeadlineCandidate,
  type HeadlineResolution,
  type NewsTitleContext,
  type RejectedHeadline,
} from '@platform/shared';
import type { PageTitles } from './fetchOgImage.js';
import { createLogger } from './logger.js';

const log = createLogger('news-title');

/** How far back a repeated title counts as taken. */
const TAKEN_LOOKBACK_DAYS = 90;

/**
 * A pre-fetching "already used" check. resolveHeadline is sync, so the
 * returned function queries once for the whole candidate set — titles already
 * stored for a DIFFERENT url from the same source (source_id when present,
 * otherwise source_name) in the last 90 days — and hands back the sync
 * predicate. A failed query takes nothing: a title is never worth failing
 * ingest over.
 *
 * relatedIds: rows from the same newsletter, which are not "another article".
 * A single-article newsletter's subject IS the linked article's headline, so
 * the followed link passes its parent's id, and a parent passes its own id to
 * ignore its children (rex_metadata.from_newsletter_item_id).
 */
export function makeIsTaken(opts: {
  sourceName: string;
  sourceId?: string | null;
  url: string;
  relatedIds?: string[];
}) {
  return async (titles: string[]): Promise<(title: string) => boolean> => {
    const unique = [...new Set(titles.filter(Boolean))];
    if (unique.length === 0) return () => false;
    try {
      const since = new Date(Date.now() - TAKEN_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
      let query = supabase
        .from('news_items')
        .select('id, title, rex_metadata')
        .in('title', unique)
        .neq('url', opts.url)
        .gte('fetched_at', since);
      query = opts.sourceId ? query.eq('source_id', opts.sourceId) : query.eq('source_name', opts.sourceName);
      const { data, error } = await query.limit(unique.length * 10);
      if (error) throw error;
      const related = new Set(opts.relatedIds ?? []);
      const rows = (data ?? []) as Array<{ id: string; title: string; rex_metadata?: { from_newsletter_item_id?: string } | null }>;
      const taken = new Set(
        rows
          .filter((r) => !related.has(r.id) && !related.has(r.rex_metadata?.from_newsletter_item_id ?? ''))
          .map((r) => r.title),
      );
      return (title: string) => taken.has(title);
    } catch (err) {
      log.warn({ err, url: opts.url }, 'taken-title lookup failed — treating no title as taken');
      return () => false;
    }
  };
}

/** og/jsonld/h1/twitter candidates from fetchPageMeta's titles. */
export function pageCandidates(titles: Partial<PageTitles> | null | undefined): HeadlineCandidate[] {
  if (!titles) return [];
  return [
    { kind: 'og', title: titles.og },
    { kind: 'jsonld', title: titles.jsonld },
    { kind: 'h1', title: titles.h1 },
    { kind: 'twitter', title: titles.twitter },
  ];
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export interface NewsHeadlineInput {
  candidates: HeadlineCandidate[];
  sourceName: string;
  sourceId?: string | null;
  url: string;
  siteName?: string | null;
  /** Add the URL slug as the last candidate (off for synthetic email:// urls). */
  includeSlug?: boolean;
  /** Titles known to be taken without a lookup (the backfill's shared titles). */
  alsoTaken?: string[];
  /** See makeIsTaken. */
  relatedIds?: string[];
}

export interface NewsHeadline {
  resolution: HeadlineResolution;
  ctx: NewsTitleContext;
  url: string;
}

/** Collect, pre-fetch the taken set, and resolve. */
export async function resolveNewsHeadline(input: NewsHeadlineInput): Promise<NewsHeadline> {
  const ctx: NewsTitleContext = {
    sourceName: input.sourceName,
    siteName: input.siteName ?? null,
    hostname: hostnameOf(input.url),
  };
  const candidates = input.includeSlug === false
    ? input.candidates
    : [...input.candidates, { kind: 'slug' as const, title: titleFromSlug(input.url) }];
  const cleaned = candidates
    .map((c) => (c.title ? cleanNewsTitle(c.title, ctx) : ''))
    .filter(Boolean);
  const lookup = await makeIsTaken({
    sourceName: input.sourceName,
    sourceId: input.sourceId,
    url: input.url,
    relatedIds: input.relatedIds,
  })(cleaned);
  const known = new Set(input.alsoTaken ?? []);
  const isTaken = (title: string) => known.has(title) || lookup(title);
  return { resolution: resolveHeadline(candidates, { ...ctx, url: input.url, isTaken }), ctx, url: input.url };
}

export interface FinalHeadline {
  title: string;
  /** For rex_metadata.title_source; null when the first candidate won outright. */
  titleSource: { from: string; rejected: RejectedHeadline[] } | null;
}

/**
 * Settle the title once extraction has run: the resolved headline, or — when
 * none qualified — the model's headline if it reads as one, else the best
 * cleaned candidate. Logs whenever the first candidate did not win.
 */
export function finaliseHeadline(h: NewsHeadline, modelHeadline?: string | null): FinalHeadline {
  const { resolution, ctx, url } = h;
  let title = resolution.title;
  let from: string = resolution.from;

  if (resolution.needsModelHeadline && modelHeadline) {
    const cleaned = cleanNewsTitle(modelHeadline, ctx);
    if (cleaned && !isGenericTitle(cleaned, ctx).generic) {
      title = cleaned;
      from = 'model';
    }
  }

  if (from !== 'model' && resolution.rejected.length === 0 && !resolution.needsModelHeadline) {
    return { title, titleSource: null };
  }
  const titleSource = { from, rejected: resolution.rejected };
  log.info({ url, title, ...titleSource }, 'headline resolved');
  return { title, titleSource };
}
