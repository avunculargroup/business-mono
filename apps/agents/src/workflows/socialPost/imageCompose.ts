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

/** Per-channel median of the bottom-right sample of an image. */
export async function samplePaper(image: Buffer): Promise<Rgb> {
  const { width = 0, height = 0 } = await sharp(image).metadata();
  const w = Math.max(1, Math.round(width * PAPER_SAMPLE_FRACTION));
  const h = Math.max(1, Math.round(height * PAPER_SAMPLE_FRACTION));
  const { data, info } = await sharp(image)
    .extract({ left: width - w, top: height - h, width: w, height: h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const channels: [number[], number[], number[]] = [[], [], []];
  for (let i = 0; i < data.length; i += info.channels) {
    channels[0].push(data[i]!);
    channels[1].push(data[i + 1]!);
    channels[2].push(data[i + 2]!);
  }
  return [median(channels[0]), median(channels[1]), median(channels[2])];
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
