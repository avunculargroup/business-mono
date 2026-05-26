export interface ScanFeedItem {
  link?: string;
  title?: string;
  contentSnippet?: string;
  content?: string;
  isoDate?: string;
  pubDate?: string;
}

export interface ScanCandidate {
  url: string;
  title: string;
  summary: string;
  source: string;
  published_at: string | null;
}

// Pure: turn one source's parsed feed items into scan candidates. Keeps items
// published within the lookback window (undated items are kept — dedup guards
// repeats), caps to maxItems, and maps fields. URL dedup across sources is the
// caller's responsibility.
export function normalizeFeedItems(
  items: ScanFeedItem[],
  opts: { sourceName: string; cutoffMs: number; maxItems: number },
): ScanCandidate[] {
  const out: ScanCandidate[] = [];
  for (const it of items) {
    const iso = it.isoDate ?? it.pubDate;
    if (iso && new Date(iso).getTime() < opts.cutoffMs) continue;
    const url = it.link?.trim();
    if (!url) continue;
    out.push({
      url,
      title: it.title?.trim() || url,
      summary: (it.contentSnippet ?? it.content ?? '').slice(0, 500),
      source: opts.sourceName,
      published_at: it.isoDate ?? null,
    });
    if (out.length >= opts.maxItems) break;
  }
  return out;
}
