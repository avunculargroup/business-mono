import { fetchFeed } from './fetchFeed.js';

// Reachability/parse check for an RSS/Atom feed, mirroring the fetch the
// news_source_scan workflow uses (executeRoutineWorkflow.ts) so a feed accepted
// here is one the daily scan can actually fetch and parse. Catches the same throw
// the workflow would hit on a bad URL, a 404/HTML page, malformed XML, a feed
// blocked behind bot protection, or a timeout.
export async function validateFeed(
  feedUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetchFeed(feedUrl);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
