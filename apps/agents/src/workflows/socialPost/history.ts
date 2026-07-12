import { SOCIAL_POST_FORMS, type SocialPostForm } from './forms.js';

// Anti-repetition + form-history helpers for the social_post_from_news routine.
// Before drafting, the handler reads an account's recent content_items drafts; these
// pure helpers turn those rows into (a) the opening lines Charlie must not reuse, and
// (b) the forms recently used on that account, so the editor can bias toward variety.
// Kept pure so they can be unit-tested without the DB.

/** The recent-draft fields the anti-repetition + rotation logic needs. */
export interface RecentPost {
  title: string | null;
  body: string | null;
  is_thread: boolean;
  post_form: string | null;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

/**
 * Map raw content_items rows to RecentPost, tolerating a null/non-array `rows`
 * (the fake Supabase and a genuinely empty account both yield those) and missing
 * fields. Never throws — a bad read degrades to "no history", not a failed run.
 */
export function toRecentPosts(rows: unknown): RecentPost[] {
  if (!Array.isArray(rows)) return [];
  return (rows as Row[]).map((r) => ({
    title: (r?.title as string | null) ?? null,
    body: (r?.body as string | null) ?? null,
    is_thread: Boolean(r?.is_thread),
    post_form: (r?.post_form as string | null) ?? null,
    created_at: (r?.created_at as string | null) ?? '',
  }));
}

/** The opener a reader sees: the first non-empty line of the body (the thread lead
 *  for a thread), falling back to the title. Collapsed, trimmed, capped. */
function openingLineOf(post: RecentPost): string {
  const source = (post.body && post.body.trim().length > 0 ? post.body : post.title) ?? '';
  const firstLine = source
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return '';
  const collapsed = firstLine.replace(/\s+/g, ' ').trim();
  return collapsed.length > 140 ? `${collapsed.slice(0, 140)}…` : collapsed;
}

/**
 * The distinct opening lines across recent posts, most-recent first (the caller
 * passes rows already ordered newest-first), deduped case-insensitively and capped.
 */
export function extractOpeningLines(posts: RecentPost[], max = 10): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const post of posts) {
    const opener = openingLineOf(post);
    if (!opener) continue;
    const key = opener.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(opener);
    if (out.length >= max) break;
  }
  return out;
}

/** The instruction block that bans reusing recent openers. Empty when none. */
export function buildRepetitionBlock(openings: string[]): string {
  if (openings.length === 0) return '';
  const list = openings.map((o) => `- ${o}`).join('\n');
  return `## Do not repeat yourself
You have recently opened posts for this account with the lines below. Do NOT reuse these openers, and do NOT reach for their phrasing or sentence shape — find a genuinely different way in.
${list}`;
}

/**
 * The forms recently used on this account, most-recent first, unique and capped —
 * unknown/null values are ignored so a stray string never poisons the bias.
 */
export function recentForms(posts: RecentPost[], max = 4): SocialPostForm[] {
  const out: SocialPostForm[] = [];
  const seen = new Set<SocialPostForm>();
  for (const post of posts) {
    const f = post.post_form;
    if (f && f in SOCIAL_POST_FORMS && !seen.has(f as SocialPostForm)) {
      seen.add(f as SocialPostForm);
      out.push(f as SocialPostForm);
      if (out.length >= max) break;
    }
  }
  return out;
}
