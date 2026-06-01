import Parser from 'rss-parser';

// Reachability/parse check for an RSS/Atom feed, mirroring the parser config the
// news_source_scan workflow uses (apps/agents/.../executeRoutineWorkflow.ts) so a
// feed accepted here is one the daily scan can actually fetch and parse. Catches
// the same throw the workflow would hit on a bad URL, a 404/HTML page, malformed
// XML, or a timeout — surfacing it at add time instead of as a silent scan failure.
const parser = new Parser({ timeout: 20000 });

export async function validateFeedUrl(
  feedUrl: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await parser.parseURL(feedUrl);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `Could not read an RSS/Atom feed at that URL (${message}). Check the feed URL and try again.`,
    };
  }
}
