/**
 * News article titles ingested from aggregators (Tavily / Google News) usually
 * carry a trailing source suffix, e.g. "Bitcoin hits new high - The Manila Times".
 * Since the source is now shown as its own badge next to every item, that suffix
 * is redundant. This strips a trailing " - / | / – / — <Publication>" segment so
 * the title reads on its own and the source lives only in the badge.
 *
 * Only a short, source-like trailing segment is removed — separators must be
 * space-padded (so "U.S.-Iran" is never split) and the remaining title must keep
 * some content.
 */
const SOURCE_SUFFIX = /\s+[-–—|]\s+([^-–—|]{1,60})$/;

export function cleanNewsTitle(title: string): string {
  const trimmed = title.trim();
  const match = SOURCE_SUFFIX.exec(trimmed);
  if (!match) return trimmed;

  const suffix = match[1]!.trim();
  // A publication name is short and isn't a sentence — bail out otherwise so we
  // don't eat a legitimate trailing clause.
  if (suffix.split(/\s+/).length > 6) return trimmed;
  if (/[.!?]$/.test(suffix)) return trimmed;

  const stripped = trimmed.slice(0, match.index).trim();
  return stripped.length >= 3 ? stripped : trimmed;
}
