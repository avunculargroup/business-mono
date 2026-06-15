// Pure helpers backing the news-ingest dedup logic in executeRoutineWorkflow.
// Kept in their own module so they can be unit-tested without booting the
// workflow's Mastra/Supabase singletons.

// Query parameters that never identify a distinct article — tracking and
// share-stream noise. Stripping them collapses variants like
// `…/spacex…/?streamIndex=0` back onto the canonical URL so the UNIQUE(url)
// constraint and the URL dedup check actually catch the duplicate.
const TRACKING_PARAMS = new Set([
  'streamindex',
  'fbclid',
  'gclid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'ref',
  'ref_src',
  'cmpid',
]);

// Canonicalise a news URL for dedup + storage: drop the fragment, lowercase the
// host, strip a leading `www.`, remove tracking params, and trim a trailing
// slash. Falls back to the trimmed input if the URL can't be parsed.
export function normalizeNewsUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    u.hostname = u.hostname.replace(/^www\./, '').toLowerCase();
    for (const key of [...u.searchParams.keys()]) {
      const k = key.toLowerCase();
      if (k.startsWith('utm_') || TRACKING_PARAMS.has(k)) u.searchParams.delete(key);
    }
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    // URL.toString keeps a dangling "?" when every param was removed.
    return u.toString().replace(/\?$/, '');
  } catch {
    return raw.trim();
  }
}

// Drop repeated indices from the LLM ranking judge's shortlist while preserving
// order. The judge schema doesn't enforce unique indices, so a repeated one
// would otherwise map the same candidate into the shortlist twice — inserting
// the article once (the second insert hits UNIQUE(url)) but surfacing it twice
// in the routine's dashboard sources.
export function dedupeShortlistIndices<T extends { index: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((item) => {
    if (seen.has(item.index)) return false;
    seen.add(item.index);
    return true;
  });
}
