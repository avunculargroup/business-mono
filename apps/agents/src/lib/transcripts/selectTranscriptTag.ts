import type { TranscriptFormat } from '@platform/shared';

// A normalised <podcast:transcript> candidate from a feed item.
export interface TranscriptTagCandidate {
  url: string;
  mimeType: string;
  language?: string | null;
}

// Format preference within a single episode (spec §"Transcript source
// preference"): JSON (richest — speaker + timestamps) → SRT/VTT (timestamped) →
// HTML → plain text. Lower rank wins.
const FORMAT_BY_MIME: Record<string, { format: TranscriptFormat; rank: number }> = {
  'application/json':      { format: 'json', rank: 0 },
  'application/srt':       { format: 'srt', rank: 1 },
  'application/x-subrip':  { format: 'srt', rank: 1 },
  'text/srt':              { format: 'srt', rank: 1 },
  'text/vtt':              { format: 'vtt', rank: 1 },
  'text/html':             { format: 'html', rank: 2 },
  'text/plain':            { format: 'text', rank: 3 },
};

function classify(mime: string): { format: TranscriptFormat; rank: number } | null {
  return FORMAT_BY_MIME[mime.trim().toLowerCase().split(';')[0]!.trim()] ?? null;
}

// rss-parser (with keepArray) hands us each <podcast:transcript> as an object
// carrying its attributes under '$'. Normalise to candidates we can rank.
export function normalizeTranscriptTags(raw: unknown): TranscriptTagCandidate[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: TranscriptTagCandidate[] = [];
  for (const entry of arr) {
    const attrs = (entry as { $?: Record<string, unknown> })?.$ ?? (entry as Record<string, unknown>);
    const url = typeof attrs?.['url'] === 'string' ? (attrs['url'] as string) : null;
    const mimeType = typeof attrs?.['type'] === 'string' ? (attrs['type'] as string) : null;
    if (!url || !mimeType) continue;
    out.push({
      url,
      mimeType,
      language: typeof attrs?.['language'] === 'string' ? (attrs['language'] as string) : null,
    });
  }
  return out;
}

// Pick the best transcript tag: prefer the configured language, then the richest
// format. Returns null when no candidate has a format we can parse.
export function selectBestTranscriptTag(
  candidates: TranscriptTagCandidate[],
  preferredLang: string,
): { url: string; format: TranscriptFormat; language: string | null } | null {
  const lang = preferredLang.trim().toLowerCase();

  const ranked = candidates
    .map((c) => {
      const cls = classify(c.mimeType);
      if (!cls) return null;
      const candLang = c.language?.trim().toLowerCase() ?? null;
      // Language score: exact match best, unspecified acceptable, mismatch worst.
      const langScore = candLang === null ? 1 : candLang.startsWith(lang) ? 0 : 2;
      return { url: c.url, format: cls.format, language: c.language ?? null, rank: cls.rank, langScore };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (ranked.length === 0) return null;

  ranked.sort((a, b) => (a.langScore - b.langScore) || (a.rank - b.rank));
  const best = ranked[0]!;
  return { url: best.url, format: best.format, language: best.language };
}
