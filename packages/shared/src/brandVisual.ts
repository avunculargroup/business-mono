
// The brand visual canon for generated social post images, and the two pure
// functions every consumer must agree on: buildImagePrompt (the exact prompt the
// image model receives) and lintImageBrief (whether a brief may be rendered).
//
// Lives in shared because three places use it: the agents' image step renders
// with it, the /content image slot pre-lints a founder's edited brief, and the
// /brand Visual tab previews the assembled prompt without spending a render. A
// second copy of either function would eventually disagree with this one about
// what was sent. No IO and no randomness; the agents suite carries a literal of
// the current prompt, so a canon change shows up in review as a changed line.
//
// Canon history, because stored rows carry every shape:
//   v1.0  one motif from a closed list. Familiar symbols, no twist: bland.
//   v1.1  the drawn/undrawn pencil device, stock symbols banned. Clever, but
//         unreadable at phone size: concept sketches that needed a caption.
//   v1.2  a bold two-colour linocut of a familiar symbol with one twist, built
//         for the half-second phone test.
// From 2026-11-09 the brief also names the post's hook and proposes up to six
// concepts, and a text-only reviewer shortlists three before any render.
// Spec: docs/features/social-post-image/feature-spec.md

/** How many concepts a brief may propose; a reviewer shortlists the ones rendered. */
export const MAX_BRIEF_CONCEPTS = 6;

/**
 * One image idea (canon v1.2). The brief proposes up to six; each one rendered
 * is stored on its rows in `content_images.image_brief`.
 */
export interface ImageConcept {
  /** The surprising or uneasy idea in the post. Not its topic. */
  tension: string;
  /** A familiar, instantly recognisable object everyone knows. */
  symbol: string;
  /** The one change that makes the symbol about this post. Visible, not explained. */
  twist: string;
  /** One sentence: the symbol with its twist, as it will be drawn. */
  subject: string;
  /** A layout key, validated against the canon's active layouts by the linter. */
  layout: string;
  /** Describes the image, not the post. */
  alt_text: string;
}

/** The structured brief: the only part of an image an LLM (or a founder) decides. */
export interface ImageBrief {
  skip: boolean;
  skip_reason: string | null;
  /**
   * The post's most specific, concrete phrase: what a reader would quote back,
   * not the topic ("capital buffers", not "regulation"). Every concept is about
   * it. Exempt from the no-digits lint: it is never sent to the image model.
   */
  hook: string;
  concepts: ImageConcept[];
}

/**
 * What the reviewer said about one rendered concept, stored beside it in
 * `content_images.image_brief.review`. Scores are 1-5; `rank` is 1 for the
 * reviewer's top pick, which renders as candidate 0.
 */
export interface ConceptReview {
  recognisable: number;
  twist_visible: number;
  on_hook: number;
  physics_ok: boolean;
  note: string;
  total: number | null;
  rank: number;
}

/** A composition preset the brief must choose from, so frames stop defaulting to centred. */
export interface Layout {
  key: string;
  label: string;
  description: string;
  is_active: boolean;
}

export interface PaletteEntry {
  role: string;
  hex: string;
  usage: string;
}

/** Canon v1.0's motif vocabulary. Retired in v1.1; kept to label images made under it. */
export interface Motif {
  key: string;
  label: string;
  description: string;
  use_when: string;
  is_active: boolean;
}

export interface BrandMark {
  enabled: boolean;
  position: 'bottom_right';
  /** Mark height as a percentage of the crop height. */
  height_pct: number;
  /** Right and bottom margin as a percentage of the crop height. */
  margin_pct: number;
  opacity: number;
}

export interface BrandVisual {
  id: string;
  version: string;
  styleBlock: string;
  palette: PaletteEntry[];
  compositionBlock: string;
  prohibitedBlock: string;
  /** Feeds the brief linter only — never sent to the model. */
  prohibitedTerms: string[];
  /** Retired in v1.1. Read only, to label images made under v1.0. */
  motifs: Motif[];
  layouts: Layout[];
  styleAnchorPaths: string[];
  defaultAspectRatio: string;
  brandMark: BrandMark;
}

export const DEFAULT_BRAND_MARK: BrandMark = {
  enabled: true,
  position: 'bottom_right',
  height_pct: 9,
  margin_pct: 4,
  opacity: 1,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function asArray(v: unknown): Row[] {
  return Array.isArray(v) ? (v as Row[]) : [];
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Map a `brand_visual` row to the canon. Tolerates malformed JSONB entries by
 * dropping them rather than throwing — the founders edit this row by hand.
 */
export function toBrandVisual(row: Row): BrandVisual {
  const mark = (row['brand_mark'] ?? {}) as Row;
  return {
    id: String(row['id'] ?? ''),
    version: String(row['version'] ?? '1.0'),
    styleBlock: String(row['style_block'] ?? '').trim(),
    palette: asArray(row['palette'])
      .filter((p) => typeof p?.hex === 'string' && typeof p?.role === 'string')
      .map((p) => ({ role: p.role, hex: p.hex, usage: typeof p.usage === 'string' ? p.usage : '' })),
    compositionBlock: String(row['composition_block'] ?? '').trim(),
    prohibitedBlock: String(row['prohibited_block'] ?? '').trim(),
    prohibitedTerms: (Array.isArray(row['prohibited_terms']) ? row['prohibited_terms'] : []).filter(
      (t: unknown): t is string => typeof t === 'string' && t.trim().length > 0,
    ),
    motifs: asArray(row['motifs'])
      .filter((m) => typeof m?.key === 'string' && typeof m?.label === 'string')
      .map((m) => ({
        key: m.key,
        label: m.label,
        description: typeof m.description === 'string' ? m.description : '',
        use_when: typeof m.use_when === 'string' ? m.use_when : '',
        is_active: m.is_active !== false,
      })),
    layouts: asArray(row['layouts'])
      .filter((l) => typeof l?.key === 'string' && typeof l?.label === 'string')
      .map((l) => ({
        key: l.key,
        label: l.label,
        description: typeof l.description === 'string' ? l.description : '',
        is_active: l.is_active !== false,
      })),
    styleAnchorPaths: (Array.isArray(row['style_anchor_paths']) ? row['style_anchor_paths'] : []).filter(
      (p: unknown): p is string => typeof p === 'string' && p.length > 0,
    ),
    defaultAspectRatio: typeof row['default_aspect_ratio'] === 'string' ? row['default_aspect_ratio'] : '16:9',
    brandMark: {
      enabled: mark['enabled'] !== false,
      position: 'bottom_right',
      height_pct: num(mark['height_pct'], DEFAULT_BRAND_MARK.height_pct),
      margin_pct: num(mark['margin_pct'], DEFAULT_BRAND_MARK.margin_pct),
      opacity: Math.min(Math.max(num(mark['opacity'], 1), 0), 1),
    },
  };
}

export function activeLayouts(canon: BrandVisual): Layout[] {
  return canon.layouts.filter((l) => l.is_active);
}

export function buildPaletteBlock(palette: PaletteEntry[]): string {
  const lines = palette.map((p) => `- ${p.role} ${p.hex}: ${p.usage}`.trimEnd());
  return `Use only these colours:
${lines.join('\n')}
No other colour. No gradients or soft shading: tone comes only from carved lines. No glow, no metallic sheen, no drop shadows.`;
}

/**
 * The exact prompt the image model receives. Order is style, palette,
 * composition, subject, prohibited — the prohibited block goes last because it
 * is the part a model most often loses when it weights the subject heavily.
 * The concept's tension is not sent: it is the reasoning, and the subject,
 * symbol and twist are how it reaches the picture. Throws if the concept
 * names a layout the canon does not have; the linter runs first, so that is a
 * programming error, not a runtime path.
 */
export function buildImagePrompt(canon: BrandVisual, concept: ImageConcept, format: { aspectRatio: string }): string {
  const layout = canon.layouts.find((l) => l.key === concept.layout);
  if (!layout) throw new Error(`buildImagePrompt: unknown layout "${concept.layout}"`);

  const subject = [
    `Subject: ${concept.subject}`,
    `The symbol: ${concept.symbol}`,
    `The twist: ${concept.twist}`,
    `Layout: ${layout.label}: ${layout.description}`,
    `Format: ${format.aspectRatio} landscape.`,
  ].join('\n');

  return [canon.styleBlock, buildPaletteBlock(canon.palette), canon.compositionBlock, subject, canon.prohibitedBlock]
    .filter((b) => b.length > 0)
    .join('\n\n');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive whole-word match; terms with no word character (₿, $) match as substrings. */
function containsTerm(text: string, term: string): boolean {
  const t = term.trim();
  if (!t) return false;
  if (!/\w/.test(t)) return text.includes(t);
  return new RegExp(`\\b${escapeRegex(t)}\\b`, 'i').test(text);
}

export interface LintOptions {
  layouts: Layout[];
  prohibitedTerms: string[];
}

/** Lower-case, letters and digits only: enough to catch a twist that just repeats its symbol. */
function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Lint one concept. Returns its flags, empty when it may be rendered. Familiar
 * symbols are wanted from v1.2 (the stock-symbol ban is lifted); finance
 * clichés and anything implying a price direction stay in `prohibitedTerms`.
 */
export function lintImageConcept(concept: ImageConcept, opts: LintOptions): string[] {
  const flags: string[] = [];
  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

  const active = new Set(opts.layouts.filter((l) => l.is_active).map((l) => l.key));
  if (!active.has(text(concept.layout))) {
    flags.push(`layout "${text(concept.layout)}" is not one of the listed layouts.`);
  }
  if (!text(concept.tension)) flags.push('tension is missing.');
  if (!text(concept.symbol)) flags.push('symbol is missing.');
  if (!text(concept.twist)) flags.push('twist is missing.');
  if (!text(concept.subject)) flags.push('subject is missing.');
  if (!text(concept.alt_text)) flags.push('alt_text is missing.');
  if (text(concept.symbol) && text(concept.twist) && normalise(concept.twist) === normalise(concept.symbol)) {
    flags.push('twist only restates the symbol; it must change the symbol in one visible way.');
  }

  const fields: Array<[string, string]> = [
    ['subject', text(concept.subject)],
    ['symbol', text(concept.symbol)],
    ['twist', text(concept.twist)],
  ];
  for (const [name, value] of fields) {
    if (!value) continue;
    const hits = opts.prohibitedTerms.filter((t) => containsTerm(value, t));
    if (hits.length > 0) flags.push(`${name} names prohibited imagery: ${hits.join(', ')}.`);
    if (/\d/.test(value)) flags.push(`${name} contains digits; numbers invite rendered text.`);
  }
  return flags;
}

export interface BriefLint {
  /** Concepts that may be rendered, in the brief's order, at most MAX_BRIEF_CONCEPTS. */
  clean: ImageConcept[];
  /** Every flag on a dropped concept, prefixed with its number, for the re-brief. */
  flags: string[];
}

/**
 * Lint a brief concept by concept. A flagged concept is dropped, not the
 * brief; so is one that repeats an earlier clean concept's symbol. A skip
 * brief is clean with nothing to render — the quiet path needs no concepts.
 */
export function lintImageBrief(brief: ImageBrief, opts: LintOptions): BriefLint {
  if (brief.skip) return { clean: [], flags: [] };
  const clean: ImageConcept[] = [];
  const flags: string[] = [];
  const symbols = new Set<string>();
  (brief.concepts ?? []).slice(0, MAX_BRIEF_CONCEPTS).forEach((concept, i) => {
    const own = lintImageConcept(concept, opts);
    const key = normalise(concept.symbol ?? '');
    if (own.length === 0 && symbols.has(key)) own.push('symbol repeats an earlier concept; each concept needs its own symbol.');
    if (own.length > 0) {
      flags.push(...own.map((f) => `Concept ${i + 1}: ${f}`));
      return;
    }
    symbols.add(key);
    clean.push(concept);
  });
  if (clean.length === 0 && flags.length === 0) flags.push('The brief returned no concepts.');
  return { clean, flags };
}

/** What every reader needs from a stored `content_images.image_brief`, whichever canon wrote it. */
export interface StoredBriefSummary {
  /** `concept` for canon v1.2+; `drawn` for v1.1's drawn/undrawn briefs; `legacy` for v1.0's motif briefs. */
  kind: 'concept' | 'drawn' | 'legacy';
  tension: string | null;
  subject: string | null;
  /** v1.2+ only. */
  symbol: string | null;
  layout: string | null;
  /** v1.0 only. */
  motifKey: string | null;
  /** The full v1.2 concept, when the row holds one; what Edit brief starts from. */
  concept: ImageConcept | null;
  /** The brief's hook, on rows rendered after the reviewer was added. */
  hook: string | null;
  /** The reviewer's scores; null when it was not run or its ranking fell back. */
  review: ConceptReview | null;
}

function readReview(v: unknown): ConceptReview | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = v as Row;
  const score = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const recognisable = score(r['recognisable']);
  const twist = score(r['twist_visible']);
  const onHook = score(r['on_hook']);
  const rank = score(r['rank']);
  if (recognisable === null || twist === null || onHook === null || rank === null) return null;
  return {
    recognisable,
    twist_visible: twist,
    on_hook: onHook,
    physics_ok: r['physics_ok'] !== false,
    note: typeof r['note'] === 'string' ? r['note'].trim() : '',
    total: score(r['total']),
    rank,
  };
}

/**
 * Read a stored brief of any canon's shape without throwing. Rows hold:
 *   v1.0  { motif_key, subject, metaphor, composition, ... }
 *   v1.1  { tension, subject, drawn, undrawn, layout, alt_text }
 *   v1.2  { tension, symbol, twist, subject, layout, alt_text }
 *         + { hook, review } once the reviewer ran (review null on a fallback);
 *         a founder's Edit brief render carries neither
 * Anything else reads as null.
 */
export function readStoredBrief(json: unknown): StoredBriefSummary | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const r = json as Row;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const base = { tension: str(r['tension']), subject: str(r['subject']), layout: str(r['layout']), hook: str(r['hook']), review: readReview(r['review']) };
  if (typeof r['symbol'] === 'string' || typeof r['twist'] === 'string') {
    const concept: ImageConcept = {
      tension: base.tension ?? '',
      symbol: str(r['symbol']) ?? '',
      twist: str(r['twist']) ?? '',
      subject: base.subject ?? '',
      layout: base.layout ?? '',
      alt_text: str(r['alt_text']) ?? '',
    };
    return { kind: 'concept', ...base, symbol: str(r['symbol']), motifKey: null, concept };
  }
  if (typeof r['undrawn'] === 'string' || typeof r['drawn'] === 'string' || typeof r['tension'] === 'string' || typeof r['layout'] === 'string') {
    return { kind: 'drawn', ...base, symbol: null, motifKey: null, concept: null };
  }
  if ('motif_key' in r || 'metaphor' in r || 'subject' in r) {
    return { kind: 'legacy', ...base, symbol: null, motifKey: str(r['motif_key']), concept: null };
  }
  return null;
}

/** The re-brief instruction naming each flag, or null when the brief is clean. */
export function imageBriefRewriteInstruction(flags: string[]): string | null {
  if (flags.length === 0) return null;
  return flags.map((f) => `- ${f}`).join('\n');
}

/** A content_images row as the selection rule reads it. */
export interface CandidateRow {
  id: string;
  generation_group_id: string;
  review_outcome: string | null;
}

export interface CandidateSelectionPlan {
  /** Rows of the chosen group: is_selected = true. */
  onIds: string[];
  /** Live rows of every other group in the set: is_selected = false. */
  offIds: string[];
}

/**
 * Which rows of a candidate set to switch on and off to select one group.
 * Retired rows (regenerated, removed) are left alone, so their outcome is
 * never overwritten. Shared by the agents' automatic pick and the web's
 * "Use this image", so the two cannot disagree about what selecting means.
 */
export function planCandidateSelection(rows: CandidateRow[], generationGroupId: string): CandidateSelectionPlan {
  const live = (r: CandidateRow) => r.review_outcome !== 'removed' && r.review_outcome !== 'regenerated';
  return {
    onIds: rows.filter((r) => r.generation_group_id === generationGroupId).map((r) => r.id),
    offIds: rows.filter((r) => r.generation_group_id !== generationGroupId && live(r)).map((r) => r.id),
  };
}

/**
 * The next canon version: a minor bump ("1.0" → "1.1", "1.9" → "1.10"). Any
 * edit that changes the assembled prompt is a new version, so every image
 * keeps naming the exact canon it was rendered with.
 */
export function nextBrandVisualVersion(version: string): string {
  const m = /^(\d+)\.(\d+)$/.exec(version.trim());
  if (!m) return '1.0';
  return `${m[1]}.${Number(m[2]) + 1}`;
}
