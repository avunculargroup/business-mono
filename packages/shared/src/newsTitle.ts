/**
 * News headline resolution, shared by every path that writes news_items.title
 * and every surface that renders one.
 *
 * A page's <title> is often a template or a site name rather than the article's
 * headline ("Piper Alderman > Australia | Legal 500 law firm profiles | News and
 * developments", "TFTC — Truth for the Commoner", "X"). Ingestion collects every
 * title a page offers — og:title, JSON-LD headline, <h1>, twitter:title, the
 * search or feed title, the reader title, the link text, the email subject and
 * the URL slug — and resolveHeadline picks the first one that reads as a
 * headline. When none does, the caller asks the extraction model for one.
 *
 * Pure: no I/O. The "already used by another article from this source" check is
 * a predicate the caller pre-computes (see apps/agents/src/lib/newsTitle.ts).
 *
 * Not to be confused with headline.ts, which writes social headline cards.
 */

export interface NewsTitleContext {
  /** news_sources.name, or the search result's publisher. */
  sourceName?: string | null;
  /** The article URL's hostname. */
  hostname?: string | null;
  /** The page's og:site_name. */
  siteName?: string | null;
}

export interface GenericTitleContext extends NewsTitleContext {
  /**
   * Skip the length rule. Set when two independent sources agree on the title
   * (og:title equals the feed/search title), so a short real headline such as
   * "Undercut" is not thrown away for being short.
   */
  allowShort?: boolean;
}

export type HeadlineKind =
  | 'og'
  | 'jsonld'
  | 'h1'
  | 'twitter'
  | 'search'
  | 'fetched'
  | 'anchor'
  | 'subject'
  | 'slug';

/** Resolution priority, best first. */
export const HEADLINE_PRIORITY: readonly HeadlineKind[] = [
  'og', 'jsonld', 'h1', 'twitter', 'search', 'fetched', 'anchor', 'subject', 'slug',
];

export interface HeadlineCandidate {
  kind: HeadlineKind;
  title: string | null | undefined;
}

export interface RejectedHeadline {
  kind: HeadlineKind;
  title: string;
  reason: string;
}

export interface ResolveHeadlineContext extends NewsTitleContext {
  /** Used as the title of last resort when every candidate is empty. */
  url?: string | null;
  /** True when another article from the same source already carries this title. */
  isTaken?: (title: string) => boolean;
}

export type HeadlineResolution =
  | { title: string; from: HeadlineKind; rejected: RejectedHeadline[]; needsModelHeadline?: false }
  | { title: string; from: 'none'; rejected: RejectedHeadline[]; needsModelHeadline: true };

// ── Entities and whitespace ───────────────────────────────────────────────────

const NAMED_ENTITIES: Record<string, string> = {
  quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', raquo: '»', laquo: '«', middot: '·', bull: '•',
};

export function decodeTitleEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (m, hex: string) => safeCodePoint(parseInt(hex, 16), m))
    .replace(/&#(\d+);/g, (m, dec: string) => safeCodePoint(Number(dec), m))
    .replace(/&([a-z]+);/gi, (m, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? m)
    .replace(/&amp;/gi, '&');
}

function safeCodePoint(cp: number, fallback: string): string {
  try {
    return String.fromCodePoint(cp);
  } catch {
    return fallback;
  }
}

// ── cleanNewsTitle ────────────────────────────────────────────────────────────

/**
 * A trailing " - / | / – / — <Publication>" segment, e.g.
 * "Bitcoin hits new high - The Manila Times". Separators must be space-padded
 * so "U.S.-Iran" is never split.
 */
const SOURCE_SUFFIX = /\s+[-–—|]\s+([^-–—|]{1,60})$/;
/** A space-padded breadcrumb separator. */
const BREADCRUMB = /\s+[>›»]\s+/;

/**
 * Peel stacked trailing source/section labels one at a time, e.g.
 * "… Common Stock – Company Announcement - FT.com - Financial Times". Only a
 * short, non-sentence segment is removed, and the remainder must keep some
 * content.
 */
function stripSourceSuffixes(title: string): string {
  let current = title;
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

/** Lowercase alphanumerics only, for name comparisons. */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/** "www.legal500.com" → "legal500"; "news.bitcoin.com" → "bitcoin". */
function hostnameStem(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? '';
  // Drop the public suffix: one label, or two for "com.au"-style suffixes.
  const twoLevel = parts.length >= 3 && /^(com|net|org|co|gov|edu|ac)$/.test(parts[parts.length - 2]!);
  const withoutSuffix = parts.slice(0, parts.length - (twoLevel ? 2 : 1));
  return withoutSuffix[withoutSuffix.length - 1] ?? '';
}

function siteNames(ctx: NewsTitleContext | undefined): string[] {
  if (!ctx) return [];
  const names = [ctx.sourceName, ctx.siteName, ctx.hostname ? hostnameStem(ctx.hostname) : null]
    .map((n) => (n ? norm(n) : ''))
    .filter((n) => n.length > 0);
  // A Tavily item's source name is its hostname ("legal500.com"); compare the stem too.
  if (ctx.sourceName && /\.[a-z]{2,}$/i.test(ctx.sourceName.trim())) {
    names.push(norm(hostnameStem(ctx.sourceName.trim())));
  }
  return [...new Set(names.filter(Boolean))];
}

/** Strip a leading "Site | " or "Site: " when Site is this source's name. */
function stripSitePrefix(title: string, ctx: NewsTitleContext | undefined): string {
  const names = siteNames(ctx);
  if (names.length === 0) return title;
  // Only "|" and ":" — a dash after a site name is usually its tagline
  // ("TFTC — Truth for the Commoner"), which must stay detectable as generic.
  const m = /^(.{1,60}?)(?:\s+\|\s+|:\s+)(.+)$/.exec(title);
  if (!m) return title;
  const prefix = norm(m[1]!);
  if (!prefix || !names.includes(prefix)) return title;
  const rest = m[2]!.trim();
  return rest.length >= 3 ? rest : title;
}

/** A segment that could stand alone as a headline. */
function isHeadlineLike(segment: string): boolean {
  return segment.length >= 12 && segment.split(/\s+/).filter(Boolean).length >= 3;
}

/**
 * Normalise a title for display and storage: decode entities, collapse
 * whitespace, drop a leading site-name prefix and trailing source suffixes, and
 * keep the last segment of a "A > B > Headline" breadcrumb when it reads as a
 * headline. A breadcrumb whose last segment does not is left in place, which
 * is what isGenericTitle flags it by.
 */
export function cleanNewsTitle(title: string, ctx?: NewsTitleContext): string {
  let current = decodeTitleEntities(title).replace(/\s+/g, ' ').trim();
  current = stripSitePrefix(current, ctx);
  current = stripSourceSuffixes(current);

  if (BREADCRUMB.test(current)) {
    const segments = current.split(BREADCRUMB);
    const last = stripSourceSuffixes(segments[segments.length - 1]!.trim());
    if (isHeadlineLike(last)) current = last;
  }
  return current;
}

// ── isGenericTitle ────────────────────────────────────────────────────────────

const PLATFORM_NAMES = new Set([
  'x', 'twitter', 'instagram', 'facebook', 'linkedin', 'youtube', 'threads', 'tiktok',
]);

const FILE_NAME = /^\S+\.(pdf|docx?|html?|aspx?)$/i;

const TEMPLATE_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/law firm profiles/i, 'template:law_firm_profiles'],
  [/news and developments/i, 'template:news_and_developments'],
  [/\bstock news$/i, 'template:stock_news'],
  [/\|\s*news$/i, 'template:pipe_news'],
  [/^(home|home page|homepage|untitled|untitled document)$/i, 'template:placeholder'],
  [/just a moment|access denied|page not found/i, 'template:error_page'],
];

/** "$MSTR" or an all-caps 2–5 letter token such as "MSTR" or "ETF". */
const TICKER = /(?:\$[A-Za-z]{1,5}\b|\b[A-Z]{2,5}\b)/;

/**
 * Whether a title is a page template, site name or other non-headline. Cleans
 * the title first (cleanNewsTitle is idempotent), so raw and cleaned input give
 * the same answer.
 */
export function isGenericTitle(
  title: string | null | undefined,
  ctx: GenericTitleContext = {},
): { generic: boolean; reason?: string } {
  const cleaned = cleanNewsTitle(title ?? '', ctx);
  if (!cleaned) return { generic: true, reason: 'empty' };

  if (BREADCRUMB.test(cleaned)) return { generic: true, reason: 'breadcrumb' };
  if (FILE_NAME.test(cleaned)) return { generic: true, reason: 'file_name' };
  if (PLATFORM_NAMES.has(norm(cleaned))) return { generic: true, reason: 'platform_name' };

  const names = siteNames(ctx);
  if (names.length > 0) {
    const segments = cleaned.split(/\s+[-–—|:•·]\s+|:\s+/).map(norm).filter(Boolean);
    if (names.includes(norm(cleaned)) || (segments.length > 0 && segments.every((s) => names.includes(s)))) {
      return { generic: true, reason: 'site_name' };
    }
  }

  for (const [re, reason] of TEMPLATE_MARKERS) {
    if (re.test(cleaned)) return { generic: true, reason };
  }

  if (!ctx.allowShort) {
    const words = cleaned.split(/\s+/).filter(Boolean).length;
    if (cleaned.length < 12 || words <= 2) {
      // "Q3 results" or "MSTR soars" is a headline; a lone token ("STRD") is not.
      const exempt = words >= 2 && (/\d/.test(cleaned) || TICKER.test(cleaned));
      if (!exempt) return { generic: true, reason: 'too_short' };
    }
  }

  return { generic: false };
}

// ── titleFromSlug ─────────────────────────────────────────────────────────────

/**
 * A readable title from the URL's last path segment, e.g.
 * ".../crossing-the-pacific-key-considerations" → "Crossing the pacific key
 * considerations". Null for numeric or id-like slugs and anything under four
 * words.
 */
export function titleFromSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return null;
  }
  const segments = path.split('/').filter(Boolean);
  let slug = segments[segments.length - 1];
  if (!slug) return null;
  try {
    slug = decodeURIComponent(slug);
  } catch {
    // keep the raw segment
  }
  slug = slug.replace(/\.(html?|aspx?|php)$/i, '');
  // An id-like slug: digits, hex/uuid, or nothing alphabetic.
  if (/^\d+$/.test(slug) || /^[0-9a-f-]{8,}$/i.test(slug) || !/[a-z]/i.test(slug)) return null;

  const words = slug
    .split(/[-_+\s]+/)
    .filter(Boolean)
    // A trailing numeric id ("…-australia-123456") is not a word of the title.
    .filter((w, i, all) => !(i === all.length - 1 && /^\d{4,}$/.test(w)));
  if (words.length < 4) return null;

  const text = words.join(' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ── resolveHeadline ───────────────────────────────────────────────────────────

function stripEllipsis(s: string): string {
  return s.replace(/\s*(?:…|\.\.\.)$/, '').trim();
}

/**
 * Pick the article's headline from the titles a page offers, best first (see
 * HEADLINE_PRIORITY). Each candidate is cleaned; the first that is neither
 * generic nor taken by another article from the same source wins. When none
 * qualifies the result says so (needsModelHeadline) and carries the best
 * cleaned candidate, or the URL, as the title to fall back on.
 */
export function resolveHeadline(
  candidates: ReadonlyArray<HeadlineCandidate>,
  ctx: ResolveHeadlineContext = {},
): HeadlineResolution {
  const ordered = candidates
    .map((c, i) => ({ ...c, i }))
    .filter((c): c is { kind: HeadlineKind; title: string; i: number } =>
      typeof c.title === 'string' && c.title.trim().length > 0)
    .sort((a, b) => HEADLINE_PRIORITY.indexOf(a.kind) - HEADLINE_PRIORITY.indexOf(b.kind) || a.i - b.i)
    .map((c) => ({ kind: c.kind, title: cleanNewsTitle(c.title, ctx) }))
    .filter((c) => c.title.length > 0);

  // og:title agreeing with the feed/search title is two sources saying the same
  // thing — enough to keep a short real headline.
  const og = ordered.find((c) => c.kind === 'og');
  const search = ordered.find((c) => c.kind === 'search');
  const ogAgrees = !!og && !!search && og.title.toLowerCase() === search.title.toLowerCase();

  const evaluate = (c: { kind: HeadlineKind; title: string }): string | null => {
    const g = isGenericTitle(c.title, { ...ctx, allowShort: c.kind === 'og' && ogAgrees });
    if (g.generic) return g.reason ?? 'generic';
    if (ctx.isTaken?.(c.title)) return 'taken';
    return null;
  };

  const rejected: RejectedHeadline[] = [];
  for (const c of ordered) {
    const reason = evaluate(c);
    if (reason) {
      rejected.push({ kind: c.kind, title: c.title, reason });
      continue;
    }
    // Tie-break: a truncated og:title loses to the <h1> it is a prefix of.
    if (c.kind === 'og') {
      const h1 = ordered.find((h) => h.kind === 'h1');
      const ogStem = stripEllipsis(c.title).toLowerCase();
      if (
        h1 &&
        h1.title.length > c.title.length &&
        ogStem.length > 0 &&
        h1.title.toLowerCase().startsWith(ogStem) &&
        evaluate(h1) === null
      ) {
        rejected.push({ kind: 'og', title: c.title, reason: 'truncated' });
        return { title: h1.title, from: 'h1', rejected };
      }
    }
    return { title: c.title, from: c.kind, rejected };
  }

  return {
    title: ordered[0]?.title ?? ctx.url ?? '',
    from: 'none',
    needsModelHeadline: true,
    rejected,
  };
}
