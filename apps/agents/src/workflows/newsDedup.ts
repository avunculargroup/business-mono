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

// Path segments that introduce a taxonomy listing rather than an article —
// `/type/fraud-scams`, `/category/crypto-news`, `/tag/bitcoin`. Tavily's news
// search returns these section pages, and the snippet it pulls from them reads
// like an article, so the judge curates them. The listing then rolls over (or
// the section is retired) and the digest link lands on a different story or a
// 404. `archive` is deliberately absent: `/bytes/archive/<slug>` is an article.
const LISTING_SEGMENTS = new Set([
  'type', 'tag', 'tags', 'category', 'categories', 'topic', 'topics',
  'section', 'sections', 'author', 'authors',
]);

// True when a URL points at a listing page — a site homepage, a taxonomy page
// (`/category/<slug>`, or the bare `/category`), or a paginated listing
// (`…/page/2`). A taxonomy segment deeper in the path doesn't count:
// `/insights/topics/economy/outlook/weekly-update.html` is an article.
export function isListingPageUrl(raw: string): boolean {
  let segments: string[];
  try {
    segments = new URL(raw).pathname.split('/').filter(Boolean).map((s) => s.toLowerCase());
  } catch {
    return false;
  }
  if (segments.length === 0) return true;
  const last = segments[segments.length - 1]!;
  const prev = segments[segments.length - 2];
  if (LISTING_SEGMENTS.has(last)) return true;
  if (prev !== undefined && LISTING_SEGMENTS.has(prev)) return true;
  return prev === 'page' && /^\d+$/.test(last);
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
