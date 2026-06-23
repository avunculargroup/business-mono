/**
 * News article titles ingested from aggregators (Tavily / Google News) usually
 * carry a trailing source suffix, e.g. "Bitcoin hits new high - The Manila Times".
 * Since the source is now shown as its own badge next to every item, that suffix
 * is redundant. This strips a trailing " - / | / – / — <Publication>" segment so
 * the title reads on its own and the source lives only in the badge.
 *
 * Aggregators sometimes stack several of these, e.g.
 * "… Common Stock – Company Announcement - FT.com - Financial Times", so we peel
 * the trailing segments off one at a time until the tail no longer looks like a
 * source/section label.
 *
 * Only a short, source-like trailing segment is removed — separators must be
 * space-padded (so "U.S.-Iran" is never split) and the remaining title must keep
 * some content.
 */
const SOURCE_SUFFIX = /\s+[-–—|]\s+([^-–—|]{1,60})$/;

export function cleanNewsTitle(title: string): string {
  let current = title.trim();

  for (;;) {
    const match = SOURCE_SUFFIX.exec(current);
    if (!match) break;

    const suffix = match[1]!.trim();
    // A publication/section label is short and isn't a sentence — stop peeling
    // otherwise so we don't eat a legitimate trailing clause.
    if (suffix.split(/\s+/).length > 6) break;
    if (/[.!?]$/.test(suffix)) break;

    const stripped = current.slice(0, match.index).trim();
    if (stripped.length < 3) break;
    current = stripped;
  }

  return current;
}
