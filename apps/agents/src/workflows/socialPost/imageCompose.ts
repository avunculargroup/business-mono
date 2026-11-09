import sharp from 'sharp';
import { BTS_MARK_SVG } from './brandMark.js';
import type { BrandMark } from './imagePrompt.js';
import type { Platform } from '../variant/schemas.js';

// One 16:9 master render → a crop per platform → the BTS mark composited
// bottom-right on each crop. Crop first, then mark, so the mark sits at the
// same place and size on every crop. The placement maths is pure so it can be
// tested without images; the sharp calls are the only IO-ish part.

export interface PlatformCrop {
  platform: Platform;
  width: number;
  height: number;
  /** content_images.platform_crop value. */
  cropKey: string;
  /** Object name under the generation group's storage folder. */
  fileName: string;
}

// Defaults match the seeded platform_specs.image_specs; parseImageSpec overrides
// the size when the row carries a well-formed `post.recommended`.
const DEFAULT_SIZES: Record<Platform, { width: number; height: number }> = {
  twitter_x: { width: 1600, height: 900 },
  linkedin: { width: 1200, height: 627 },
};

const PLATFORM_SLUG: Record<Platform, string> = { twitter_x: 'x', linkedin: 'linkedin' };

/** Resolve a platform's crop from its platform_specs.image_specs JSONB. */
export function platformCrop(platform: Platform, imageSpecs?: unknown): PlatformCrop {
  const rec = (imageSpecs as { post?: { recommended?: unknown } } | null | undefined)?.post?.recommended;
  const m = typeof rec === 'string' ? /^(\d{2,5})\s*x\s*(\d{2,5})$/i.exec(rec.trim()) : null;
  const { width, height } = m ? { width: Number(m[1]), height: Number(m[2]) } : DEFAULT_SIZES[platform];
  const slug = PLATFORM_SLUG[platform];
  return {
    platform,
    width,
    height,
    cropKey: `${slug}_${width}x${height}`,
    fileName: `${slug}-${width}x${height}.png`,
  };
}

export interface MarkPlacement {
  width: number;
  height: number;
  left: number;
  top: number;
}

/** The mark's aspect ratio (width / height), from the SVG viewBox. */
export function markAspect(svg: string = BTS_MARK_SVG): number {
  const vb = /viewBox="\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)\s*"/.exec(svg);
  if (!vb) return 1;
  const w = Number(vb[1]);
  const h = Number(vb[2]);
  return w > 0 && h > 0 ? w / h : 1;
}

/**
 * Where the mark goes on a crop. Height and margins are percentages of the crop
 * height, so the mark looks the same size on both platforms.
 */
export function markPlacement(cropWidth: number, cropHeight: number, mark: BrandMark, aspect = 1): MarkPlacement {
  const height = Math.round((cropHeight * mark.height_pct) / 100);
  const width = Math.round(height * aspect);
  const margin = Math.round((cropHeight * mark.margin_pct) / 100);
  return { width, height, left: cropWidth - margin - width, top: cropHeight - margin - height };
}

async function rasteriseMark(placement: MarkPlacement, opacity: number): Promise<Buffer> {
  const svg = opacity < 1 ? BTS_MARK_SVG.replace('<svg ', `<svg opacity="${opacity}" `) : BTS_MARK_SVG;
  // High density so librsvg rasterises the gradient crisply before downsizing.
  return sharp(Buffer.from(svg), { density: 600 })
    .resize({ width: placement.width, height: placement.height, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// ── Paper correction ─────────────────────────────────────────────────────────
// Models drift the paper toward cream or aged parchment however the palette
// words it. The canon keeps the bottom-right corner empty, and the mark is not
// on yet, so that corner is a clean sample of what the model drew as paper.
// Scaling each channel so the sample lands on the palette's paper colour pulls
// the whole render back, within a clamp so a misread can never repaint it.

export const DEFAULT_PAPER_HEX = '#FAFAF8';
/** The sample is the lowest, rightmost 12% of the master in each dimension. */
export const PAPER_SAMPLE_FRACTION = 0.12;
/**
 * Below this the corner holds drawing, not paper, and is left alone. Luma from
 * gamma-encoded values, deliberately not linear-light luminance: yellowed paper
 * (the case being corrected) falls under 0.80 in linear light and would be
 * skipped, while ink in the corner still falls well below it.
 */
export const MIN_PAPER_LUMA = 0.8;
export const GAIN_MIN = 0.9;
export const GAIN_MAX = 1.15;

export type Rgb = [number, number, number];

export interface PaperCorrection {
  sample: Rgb;
  gains: Rgb;
  applied: boolean;
  reason: string;
}

function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null;
}

/** Rec. 709 weights over gamma-encoded 0–1 values. */
export function paperLuma([r, g, b]: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * The per-channel gains that move the sampled paper onto the target paper
 * colour, clamped to [GAIN_MIN, GAIN_MAX]. Pure, so it is tested without images.
 */
export function paperGains(sample: Rgb, targetHex: string): PaperCorrection {
  const target = hexToRgb(targetHex) ?? hexToRgb(DEFAULT_PAPER_HEX)!;
  const unity: Rgb = [1, 1, 1];
  const luma = paperLuma(sample);
  if (luma < MIN_PAPER_LUMA) {
    return { sample, gains: unity, applied: false, reason: `corner luma ${luma.toFixed(3)} is below ${MIN_PAPER_LUMA}; it is not empty paper` };
  }
  const clamp = (g: number) => Math.min(Math.max(g, GAIN_MIN), GAIN_MAX);
  const gains = sample.map((c, i) => Number(clamp(target[i]! / Math.max(c, 1)).toFixed(4))) as Rgb;
  const clamped = sample.some((c, i) => target[i]! / Math.max(c, 1) !== clamp(target[i]! / Math.max(c, 1)));
  return {
    sample,
    gains,
    applied: true,
    reason: clamped ? 'corrected toward the palette paper; at least one channel hit the clamp' : 'corrected toward the palette paper',
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Per-channel median of one rectangle of an image. */
async function sampleRegion(image: Buffer, region: { left: number; top: number; width: number; height: number }): Promise<Rgb> {
  const { data, info } = await sharp(image).extract(region).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < data.length; i += info.channels) {
    channels[0].push(data[i]!);
    channels[1].push(data[i + 1]!);
    channels[2].push(data[i + 2]!);
  }
  return [median(channels[0]), median(channels[1]), median(channels[2])];
}

/** Per-channel median of the bottom-right sample of an image. */
export async function samplePaper(image: Buffer): Promise<Rgb> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const w = Math.max(1, Math.round(width * PAPER_SAMPLE_FRACTION));
  const h = Math.max(1, Math.round(height * PAPER_SAMPLE_FRACTION));
  return sampleRegion(image, { left: width - w, top: height - h, width: w, height: h });
}

/**
 * Correct the paper of a master before it is cropped and marked, so every crop
 * and any style anchor promoted from the master share the corrected paper.
 */
export async function correctPaper(master: Buffer, targetHex: string): Promise<{ image: Buffer; correction: PaperCorrection }> {
  const correction = paperGains(await samplePaper(master), targetHex);
  if (!correction.applied) return { image: master, correction };
  const image = await sharp(master).linear(correction.gains, [0, 0, 0]).png().toBuffer();
  return { image, correction };
}

// ── Corners: a print, not a photograph of one ───────────────────────────────
// A render is meant to be the printed sheet itself, filling the frame. Some come
// back as a photograph of a print: on the 2026-11-09 CP 392 run the railway
// signal gantry lay on a wooden table (wood in the top-left corner, a paper
// edge, perspective) and an earlier football pitch had a grey shadow at its
// edge. Every corner of a real print is paper, ink or gold (close_crop subjects
// run off the edge), so a corner far from all three is the table or the shadow.
// Runs after the paper correction, so slightly cream paper has been pulled back.

/** Each corner sample is a square this share of the shorter side. */
export const CORNER_SAMPLE_FRACTION = 0.05;
/**
 * Largest RGB distance from the nearest palette colour a corner may sit at.
 * Cream paper ([238, 237, 233], about 23 from #FAFAF8) passes; a wood-brown
 * table ([150, 110, 70], about 77 from gold) and a grey shadow
 * ([185, 182, 175], about 101 from gold) fail.
 */
export const CORNER_MAX_DISTANCE = 45;
/** Paper, ink and gold: the corner check's palette when the canon carries none. */
export const DEFAULT_CORNER_PALETTE = ['#FAFAF8', '#1A1915', '#C9A84C'];

export interface CornerCheck {
  pass: boolean;
  /** Indexes of the corners that failed: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right. */
  failing: number[];
  /** Each corner's distance from its nearest palette colour, rounded to 0.1. */
  distances: number[];
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Whether every corner sits near a palette colour. Pure: the samples come from
 * cornerSamples. A palette with no parseable colour falls back to the default.
 */
export function cornerCheck(samples: Rgb[], palette: string[]): CornerCheck {
  const parsed = palette.map(hexToRgb).filter((c): c is Rgb => c !== null);
  const colours = parsed.length > 0 ? parsed : DEFAULT_CORNER_PALETTE.map((h) => hexToRgb(h)!);
  const distances = samples.map((s) => Number(Math.min(...colours.map((c) => rgbDistance(s, c))).toFixed(1)));
  const failing = distances.flatMap((d, i) => (d > CORNER_MAX_DISTANCE ? [i] : []));
  return { pass: failing.length === 0, failing, distances };
}

/** Per-channel medians of the four corners: top-left, top-right, bottom-left, bottom-right. */
export async function cornerSamples(image: Buffer): Promise<Rgb[]> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const side = Math.max(1, Math.round(Math.min(width, height) * CORNER_SAMPLE_FRACTION));
  const right = width - side;
  const bottom = height - side;
  return Promise.all(
    [
      { left: 0, top: 0 },
      { left: right, top: 0 },
      { left: 0, top: bottom },
      { left: right, top: bottom },
    ].map((at) => sampleRegion(image, { ...at, width: side, height: side })),
  );
}

/** The corner check on a master. */
export async function corners(master: Buffer, palette: string[]): Promise<CornerCheck & { samples: Rgb[] }> {
  const samples = await cornerSamples(master);
  return { ...cornerCheck(samples, palette), samples };
}

// ── Letterbox bars ───────────────────────────────────────────────────────────
// Models sometimes return a landscape frame letterboxed with black bars. Left in,
// they become part of every crop, and the paper sample (the bottom-right corner)
// lands on a bar, so the paper correction skips. Stripping them first fixes both.

/** A bar line: near-black (mean luma below this) ... */
export const BAR_MAX_MEAN = 0.12;
/** ... and near-uniform (luma standard deviation below this). A dark subject touching an edge varies more. */
export const BAR_MAX_STD = 0.04;
/** Bars over this share of the height or width are not letterboxing: the candidate is rejected. */
export const BAR_MAX_SHARE = 0.2;

/** Mean and standard deviation of luma (0–1) along one row or column. */
export interface LineStats {
  mean: number;
  std: number;
}

export interface BarDetection {
  top: number;
  bottom: number;
  left: number;
  right: number;
  reject: boolean;
  reason: string;
}

function isBar(line: LineStats): boolean {
  return line.mean < BAR_MAX_MEAN && line.std < BAR_MAX_STD;
}

function countFromEdge(lines: LineStats[]): number {
  let n = 0;
  while (n < lines.length && isBar(lines[n]!)) n += 1;
  return n;
}

/**
 * How many bar lines run inwards from each edge, given per-row stats (top to
 * bottom) and per-column stats (left to right). Pure, so it is tested without
 * images; `stripBars` is the sharp wrapper.
 */
export function detectBars(rows: LineStats[], cols: LineStats[]): BarDetection {
  const top = countFromEdge(rows);
  const bottom = top >= rows.length ? 0 : countFromEdge([...rows].reverse());
  const left = countFromEdge(cols);
  const right = left >= cols.length ? 0 : countFromEdge([...cols].reverse());
  const vertical = rows.length > 0 ? (top + bottom) / rows.length : 0;
  const horizontal = cols.length > 0 ? (left + right) / cols.length : 0;
  if (vertical > BAR_MAX_SHARE || horizontal > BAR_MAX_SHARE) {
    return {
      top,
      bottom,
      left,
      right,
      reject: true,
      reason: `bars cover ${Math.round(Math.max(vertical, horizontal) * 100)}% of the frame; that is not letterboxing`,
    };
  }
  const any = top + bottom + left + right > 0;
  return { top, bottom, left, right, reject: false, reason: any ? 'letterbox bars stripped' : 'no bars' };
}

/** Per-row and per-column luma stats of an image, from its greyscale pixels. */
export async function lineStats(image: Buffer): Promise<{ rows: LineStats[]; cols: LineStats[] }> {
  const { data, info } = await sharp(image).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const rowSum = new Float64Array(height);
  const rowSq = new Float64Array(height);
  const colSum = new Float64Array(width);
  const colSq = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const v = data[(y * width + x) * channels]! / 255;
      rowSum[y] += v;
      rowSq[y] += v * v;
      colSum[x] += v;
      colSq[x] += v * v;
    }
  }
  const stats = (sum: Float64Array, sq: Float64Array, n: number): LineStats[] =>
    Array.from(sum, (s, i) => {
      const mean = s / n;
      return { mean, std: Math.sqrt(Math.max(sq[i]! / n - mean * mean, 0)) };
    });
  return { rows: stats(rowSum, rowSq, width), cols: stats(colSum, colSq, height) };
}

/**
 * Strip letterbox bars from a master before anything else reads it. Returns the
 * image unchanged when there are none. When the detection rejects (bars over
 * BAR_MAX_SHARE), the image is returned as is and the caller drops the candidate.
 */
export async function stripBars(master: Buffer): Promise<{ image: Buffer; bars: BarDetection }> {
  const { rows, cols } = await lineStats(master);
  const bars = detectBars(rows, cols);
  if (bars.reject || bars.top + bars.bottom + bars.left + bars.right === 0) return { image: master, bars };
  const image = await sharp(master)
    .extract({
      left: bars.left,
      top: bars.top,
      width: cols.length - bars.left - bars.right,
      height: rows.length - bars.top - bars.bottom,
    })
    .png()
    .toBuffer();
  return { image, bars };
}

// ── Legibility gate ──────────────────────────────────────────────────────────
// The half-second phone test, measured: at phone width, enough of the image
// must be printed (black or gold) to register in a mostly white feed, and not
// so much that it reads as a muddy black mass. Gold #C9A84C is about 0.66 luma,
// so it counts as ink. A candidate outside the band is not persisted.

/** Pixels darker than this luma count as ink. */
export const INK_LUMA = 0.75;
export const MIN_INK_COVERAGE = 0.2;
export const MAX_INK_COVERAGE = 0.75;
/** The check runs at about the width a phone shows the image. */
export const LEGIBILITY_WIDTH = 300;

export interface InkCoverage {
  coverage: number;
  pass: boolean;
  reason: string;
}

/** Ink coverage from a 256-bin luma histogram. Pure, so it is tested without images. */
export function inkCoverage(histogram: number[]): InkCoverage {
  const total = histogram.reduce((a, b) => a + b, 0);
  if (total === 0) return { coverage: 0, pass: false, reason: 'empty image' };
  const cutoff = Math.round(INK_LUMA * 255);
  const ink = histogram.slice(0, cutoff).reduce((a, b) => a + b, 0);
  const coverage = Number((ink / total).toFixed(4));
  if (coverage < MIN_INK_COVERAGE) {
    return { coverage, pass: false, reason: `ink covers ${Math.round(coverage * 100)}%; too faint to register at phone size` };
  }
  if (coverage > MAX_INK_COVERAGE) {
    return { coverage, pass: false, reason: `ink covers ${Math.round(coverage * 100)}%; reads as a solid mass at phone size` };
  }
  return { coverage, pass: true, reason: 'legible at phone size' };
}

/** The legibility gate: downscale to phone width, greyscale, measure ink coverage. */
export async function legibility(master: Buffer): Promise<InkCoverage> {
  const { data, info } = await sharp(master)
    .resize({ width: LEGIBILITY_WIDTH })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i += info.channels) histogram[data[i]!] += 1;
  return inkCoverage(histogram);
}

/** Normalise whatever the model returned (png/jpeg/webp) to the PNG master. */
export async function toPngMaster(image: Buffer): Promise<Buffer> {
  return sharp(image).png().toBuffer();
}

/** Centre-crop and resize the master to a platform's size, then composite the mark. */
export async function composePlatformImage(master: Buffer, crop: PlatformCrop, mark: BrandMark): Promise<Buffer> {
  const resized = await sharp(master)
    .resize(crop.width, crop.height, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();
  if (!mark.enabled) return resized;

  const placement = markPlacement(crop.width, crop.height, mark, markAspect());
  const markPng = await rasteriseMark(placement, mark.opacity);
  return sharp(resized)
    .composite([{ input: markPng, left: placement.left, top: placement.top }])
    .png()
    .toBuffer();
}
