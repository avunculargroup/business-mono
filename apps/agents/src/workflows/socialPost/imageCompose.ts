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
