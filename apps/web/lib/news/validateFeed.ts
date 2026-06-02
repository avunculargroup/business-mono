import { fetchFeed } from './fetchFeed';

// Reachability/parse check for an RSS/Atom feed, mirroring the fetch the
// news_source_scan workflow uses (apps/agents/.../executeRoutineWorkflow.ts) so a
// feed accepted here is one the daily scan can actually fetch and parse. Catches
// the same throw the workflow would hit on a bad URL, a 404/HTML page, malformed
// XML, a feed blocked behind bot protection, or a timeout — surfacing it at add
// time instead of as a silent scan failure.
export async function validateFeedUrl(
  feedUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await fetchFeed(feedUrl);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Could not read an RSS/Atom feed at that URL (${message}). Check the feed URL and try again.`,
    };
  }
}
