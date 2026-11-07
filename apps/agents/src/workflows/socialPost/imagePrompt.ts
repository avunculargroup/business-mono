import type { ImageBrief } from './imageBrief.js';

// Deterministic prompt assembly for the social post image step. The LLM writes a
// structured brief; this module joins it to the brand visual canon (the
// `brand_visual` row) in a fixed order. No IO and no randomness, so the exact
// prompt a model receives is reproducible and snapshot-tested — a canon change
// shows up as a changed literal in review, which is the cue to bump its version.
// Written without routine-specific inputs so the campaign workflow can reuse it.

export interface PaletteEntry {
  role: string;
  hex: string;
  usage: string;
}

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
  motifs: Motif[];
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

export function activeMotifs(canon: BrandVisual): Motif[] {
  return canon.motifs.filter((m) => m.is_active);
}

export function buildPaletteBlock(palette: PaletteEntry[]): string {
  const lines = palette.map((p) => `- ${p.role} ${p.hex}: ${p.usage}`.trimEnd());
  return `Use only these colours:
${lines.join('\n')}
No other colour. No gradients, no glow, no metallic sheen, no drop shadows.`;
}

/**
 * The exact prompt the image model receives. Order is style, palette,
 * composition, subject, prohibited — the prohibited block goes last because it
 * is the part a model most often loses when it weights the subject heavily.
 * Throws if the brief names a motif the canon does not have; the linter runs
 * first, so that is a programming error, not a runtime path.
 */
export function buildImagePrompt(canon: BrandVisual, brief: ImageBrief, format: { aspectRatio: string }): string {
  const motif = canon.motifs.find((m) => m.key === brief.motif_key);
  if (!motif) throw new Error(`buildImagePrompt: unknown motif "${brief.motif_key}"`);

  const subject = [
    `Subject: ${brief.subject ?? ''}`,
    `Visual metaphor: ${motif.label} — ${brief.metaphor ?? motif.description}`,
    brief.composition ? `Composition note: ${brief.composition}` : null,
    `Format: ${format.aspectRatio} landscape.`,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  return [canon.styleBlock, buildPaletteBlock(canon.palette), canon.compositionBlock, subject, canon.prohibitedBlock]
    .filter((b) => b.length > 0)
    .join('\n\n');
}
