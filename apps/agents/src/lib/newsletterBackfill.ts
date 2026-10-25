/**
 * Pure planning helpers for scripts/backfillNewsletterContent.ts — the
 * one-off clean of news_items rows stored before the extraction rework.
 * Spec: docs/news-source-email-extraction-spec.md, "Backfill and cleanup".
 *
 * Nothing here touches the network or the database, so every decision the
 * backfill makes about a row can be tested before it runs against real data.
 */

import { isSubscriberScoped } from '@platform/shared';
import { normaliseMarkdown } from './newsletterExtract.js';
import { stripTrackingParams, unwrapOffline } from './urlClean.js';

/** The window the extractor and Rex's rubric read: body.slice(0, 12000). */
export const SCORED_WINDOW_CHARS = 12_000;

/** Re-score only when more than this share of the scored window changed. */
export const RESCORE_THRESHOLD = 0.2;

/** A link that can be kept as-is after cleaning, or null when only its text may stay. */
function cleanLink(url: string): string | null {
  const unwrapped = unwrapOffline(url);
  if (!unwrapped) return null;
  const clean = stripTrackingParams(unwrapped);
  return isSubscriberScoped(clean) ? null : clean;
}

/**
 * Markdown-level cleanup for an email item whose raw message is gone. Decodes
 * encodable wrappers, reduces opaque-wrapper links to their text, strips
 * tracking parameters, drops bare subscriber-scoped URLs, then normalises.
 * Leaves the footer alone: with no DOM there is nothing to guard the cut.
 */
export function cleanStoredMarkdown(md: string, subject?: string): string {
  const linked = md.replace(/(!?)\[([^\]]*)\]\(([^)\s]+)(\s+"[^"]*")?\)/g, (whole, bang: string, text: string, url: string) => {
    if (bang) return whole; // images: normaliseMarkdown removes them
    if (!/^https?:\/\//i.test(url)) return whole;
    const clean = cleanLink(url);
    return clean ? `[${text}](${clean})` : text;
  });
  // Bare URLs outside link syntax (plain-text bodies, Turndown autolinks).
  const bare = linked.replace(/(^|[\s<(])(https?:\/\/[^\s<>()]+)/g, (whole, lead: string, url: string) => {
    if (!isSubscriberScoped(url) && cleanLink(url) === url) return whole;
    const clean = cleanLink(url);
    return clean ? `${lead}${clean}` : lead;
  });
  return normaliseMarkdown(bare, { subject });
}

/**
 * Share of the scored window that differs between two bodies, by line: the
 * characters of lines present in one window and not the other, over the old
 * window's length. Line-level because the clean removes and rewrites whole
 * lines; a character-level diff of two 12,000-character strings is too slow
 * to run over thousands of rows.
 */
export function scoredWindowChange(oldBody: string, newBody: string): number {
  const before = oldBody.slice(0, SCORED_WINDOW_CHARS);
  const after = newBody.slice(0, SCORED_WINDOW_CHARS);
  if (before === after) return 0;
  if (before.length === 0) return after.length > 0 ? 1 : 0;
  const lines = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean);
  const oldLines = lines(before);
  const newLines = lines(after);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const removed = oldLines.filter((l) => !newSet.has(l)).reduce((n, l) => n + l.length, 0);
  const added = newLines.filter((l) => !oldSet.has(l)).reduce((n, l) => n + l.length, 0);
  return Math.min(1, (removed + added) / before.length);
}

export interface DuplicateCandidate {
  id: string;
  url: string;
  relevanceScore: number | null;
  createdAt: string;
}

/**
 * For each URL shared by more than one row, the row to keep and the rows to
 * fold into it: the higher relevance_score wins, then the earlier created_at,
 * then the lower id (so the choice is stable across runs).
 */
export function planDuplicates(rows: readonly DuplicateCandidate[]): Array<{ keep: string; remove: string[]; url: string }> {
  const byUrl = new Map<string, DuplicateCandidate[]>();
  for (const r of rows) {
    const list = byUrl.get(r.url) ?? [];
    list.push(r);
    byUrl.set(r.url, list);
  }
  const out: Array<{ keep: string; remove: string[]; url: string }> = [];
  for (const [url, list] of byUrl) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) =>
        (b.relevanceScore ?? -1) - (a.relevanceScore ?? -1) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    );
    out.push({ keep: sorted[0]!.id, remove: sorted.slice(1).map((r) => r.id), url });
  }
  return out;
}

/** Merged curator notes: the keeper's, then each removed row's that differ. */
export function mergeCuratorNotes(keeper: string | null, others: ReadonlyArray<string | null>): string | null {
  const notes = [keeper, ...others].map((n) => n?.trim()).filter((n): n is string => Boolean(n));
  const unique = notes.filter((n, i) => notes.indexOf(n) === i);
  return unique.length > 0 ? unique.join('\n\n') : null;
}

// ── Report ─────────────────────────────────────────────────────────────────

export type BackfillAction =
  | 'update_body' // email item: body (and canonical_url) regenerated
  | 'update_url' // followed link: url + ingestion_ref moved to the real URL
  | 'delete_filtered' // followed link: real URL is now denied
  | 'delete_unresolvable' // followed link: wrapper could not be resolved
  | 'merge'; // duplicate: folded into keep_id

/** Actions that remove a row — the write pass runs these only when approve=yes. */
export const DESTRUCTIVE_ACTIONS: readonly BackfillAction[] = ['delete_filtered', 'delete_unresolvable', 'merge'];

export interface BackfillRow {
  action: BackfillAction;
  id: string;
  source: string;
  title: string;
  /** Host only for a wrapper — the report never carries a subscriber token. */
  oldUrlHost: string;
  newUrl: string;
  keepId: string;
  reason: string;
  bodyChangePct: string;
  rescore: 'yes' | 'no';
  approve: string;
}

const COLUMNS: ReadonlyArray<keyof BackfillRow> = [
  'action',
  'id',
  'source',
  'title',
  'oldUrlHost',
  'newUrl',
  'keepId',
  'reason',
  'bodyChangePct',
  'rescore',
  'approve',
];

function csvCell(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toCsv(rows: readonly BackfillRow[]): string {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvCell(String(r[c] ?? ''))).join(','));
  return `${lines.join('\n')}\n`;
}

/** RFC 4180 parse, enough for the report this module writes. */
export function parseCsv(text: string): BackfillRow[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((r) => r.some((c) => c !== ''));
  if (!header) return [];
  return body.map((r) => {
    const row = {} as Record<string, string>;
    header.forEach((h, i) => (row[h] = r[i] ?? ''));
    return row as unknown as BackfillRow;
  });
}

/** Key a planned action is matched on between the dry run and the write pass. */
export function rowKey(r: Pick<BackfillRow, 'action' | 'id' | 'newUrl' | 'keepId'>): string {
  return `${r.action}|${r.id}|${r.newUrl}|${r.keepId}`;
}

/**
 * The planned rows a reviewed report authorises: present in the report with
 * the same action and target, and approve=yes where the action removes a row.
 */
export function approvedRows(planned: readonly BackfillRow[], reviewed: readonly BackfillRow[]): BackfillRow[] {
  const ok = new Map(reviewed.map((r) => [rowKey(r), r]));
  return planned.filter((p) => {
    const r = ok.get(rowKey(p));
    if (!r) return false;
    return DESTRUCTIVE_ACTIONS.includes(p.action) ? r.approve.trim().toLowerCase() === 'yes' : true;
  });
}
