import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type OverlayOptions, type Sharp } from 'sharp';
import { parse, type Font } from 'opentype.js';
import { DEFAULT_CARD_SETTINGS, typographicQuotes, type CardSettings } from '@platform/shared';
import { DEFAULT_PAPER_HEX, markAspect, markPlacement, rasteriseMark, type PlatformCrop } from './imageCompose.js';
import type { BrandMark } from './imagePrompt.js';
import type { Platform } from '../variant/schemas.js';

// Headline cards (2026-11-20): square art flush right, a headline set in real
// type on paper to its left, the BTS mark in the art's bottom-right corner.
// The picture sets the mood; three to six words carry the meaning.
//
// Type is set by code, never drawn by the model. The fonts are static TTFs
// bundled in apps/agents/assets/fonts (OFL), measured and drawn with
// opentype.js, and emitted as SVG paths, so sharp/librsvg rasterises them with
// no font lookup and Railway needs no fontconfig. The layout maths is pure.
// Spec: docs/features/social-post-image/feature-spec.md → Headline cards

/** The card's paper, ink and kicker colours: the paper and ink tokens, and --color-accent-dark. */
export const CARD_PAPER_HEX = DEFAULT_PAPER_HEX;
export const CARD_INK_HEX = '#1A1915';
export const CARD_KICKER_HEX = '#9A7A2E';

/** Every number below is for the LinkedIn card, 627px tall; other heights scale by height / 627. */
const BASE_HEIGHT = 627;
const BASE = {
  paddingLeft: 56,
  paddingRight: 36,
  kickerSize: 20,
  kickerGap: 16,
  sizeStep: 4,
} as const;
/** Kicker letter-spacing, in em. */
const KICKER_TRACKING = 0.08;
const HEADLINE_LINE_HEIGHT = 1.1;

const DEFAULT_SIZES: Record<Platform, { width: number; height: number }> = {
  linkedin: { width: 1200, height: 627 },
  twitter_x: { width: 1600, height: 900 },
};

export interface CardGeometry {
  width: number;
  height: number;
  /** The square art panel, flush right, full height. */
  art: { left: number; top: number; size: number };
  /** The text block's left edge and width inside the text panel. */
  text: { left: number; width: number };
  kicker: { size: number; tracking: number; gap: number };
  /** Headline sizes to try, largest first, ending at the minimum. */
  headline: { sizes: number[]; lineHeight: number; maxLines: number };
}

/**
 * The card's geometry for a platform, in one place. LinkedIn 1200 × 627: art
 * 627 × 627 at x = 573, text 56 in from the left and 36 short of the art (481
 * wide), kicker 20px, headline 64 → 44 in steps of 4. X 1600 × 900 is the same
 * scaled by 900 / 627. Sizes and line count come from the canon's card settings.
 */
export function cardLayout(
  platform: Platform,
  card: CardSettings = DEFAULT_CARD_SETTINGS,
  size: { width: number; height: number } = DEFAULT_SIZES[platform],
): CardGeometry {
  const { width, height } = size;
  const s = height / BASE_HEIGHT;
  const px = (n: number) => Math.round(n * s);
  const panel = width - height;
  const left = px(BASE.paddingLeft);
  const sizes: number[] = [];
  for (let n = card.headline_size_max; n > card.headline_size_min; n -= BASE.sizeStep) sizes.push(px(n));
  sizes.push(px(card.headline_size_min));
  return {
    width,
    height,
    art: { left: panel, top: 0, size: height },
    text: { left, width: panel - left - px(BASE.paddingRight) },
    kicker: { size: px(BASE.kickerSize), tracking: KICKER_TRACKING, gap: px(BASE.kickerGap) },
    headline: { sizes: [...new Set(sizes)], lineHeight: HEADLINE_LINE_HEIGHT, maxLines: card.max_lines },
  };
}

/**
 * Greedy word wrap: as many words on a line as fit. Never breaks inside a
 * word; null when one word is wider than the line or the text needs more than
 * `maxLines`. Pure: `measure` is the width of a string at the current size.
 */
export function wrapHeadline(
  text: string,
  measure: (s: string) => number,
  maxWidth: number,
  maxLines: number,
): string[] | null {
  const words = text.trim().split(/ +/).filter(Boolean);
  if (words.length === 0) return null;
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (measure(word) > maxWidth) return null;
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  lines.push(line);
  return lines.length <= maxLines ? lines : null;
}

/** The largest size, of `sizes` (largest first), at which the headline wraps into `maxLines`. Null when none does. Pure. */
export function fitHeadline(
  text: string,
  measureAt: (s: string, size: number) => number,
  sizes: number[],
  maxWidth: number,
  maxLines: number,
): { size: number; lines: string[] } | null {
  for (const size of sizes) {
    const lines = wrapHeadline(text, (s) => measureAt(s, size), maxWidth, maxLines);
    if (lines) return { size, lines };
  }
  return null;
}

// ── Fonts ────────────────────────────────────────────────────────────────────

export interface CardFonts {
  headline: Font;
  kicker: Font;
}

const FONT_FILES = { headline: 'PlayfairDisplay-Bold.ttf', kicker: 'DMSans-SemiBold.ttf' } as const;

function fontDir(): string {
  const candidates = [
    // Dev and tests: three levels up from this file is apps/agents.
    resolve(dirname(fileURLToPath(import.meta.url)), '../../../assets/fonts'),
    // Production: CWD is /app, assets/ copied alongside .mastra/output/ (Dockerfile).
    resolve(process.cwd(), 'assets/fonts'),
  ];
  const found = candidates.find((d) => existsSync(resolve(d, FONT_FILES.headline)));
  if (!found) throw new Error(`card fonts not found. Tried: ${candidates.join(', ')}`);
  return found;
}

function loadFont(path: string): Font {
  const bytes = readFileSync(path);
  return parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

let cached: CardFonts | null = null;

/** The bundled card fonts, parsed once. Throws when they cannot be read; callers fall back to an image-only card. */
export function loadCardFonts(): CardFonts {
  if (cached) return cached;
  const dir = fontDir();
  cached = { headline: loadFont(resolve(dir, FONT_FILES.headline)), kicker: loadFont(resolve(dir, FONT_FILES.kicker)) };
  return cached;
}

const measureWith = (font: Font) => (s: string, size: number) => font.getAdvanceWidth(s, size, { kerning: true });

export interface CardText {
  /** Upper-case label over the headline, or null for none. */
  kicker: string | null;
  headline: string;
}

/**
 * Whether a headline fits a platform's card, and at what size. Typographic
 * quotes are applied first, because that is what is drawn. Null when it does
 * not fit at the minimum size within the line limit.
 */
export function fitCardHeadline(
  headline: string,
  geometry: CardGeometry,
  fonts: CardFonts,
): { size: number; lines: string[] } | null {
  return fitHeadline(
    typographicQuotes(headline.trim()),
    measureWith(fonts.headline),
    geometry.headline.sizes,
    geometry.text.width,
    geometry.headline.maxLines,
  );
}

/** Where a line's baseline sits in a line box: the font's content area centred in it, as CSS does. */
function baselineIn(font: Font, top: number, size: number, lineHeight: number): number {
  const box = size * lineHeight;
  const ascent = (font.ascender / font.unitsPerEm) * size;
  const content = ((font.ascender - font.descender) / font.unitsPerEm) * size;
  return top + (box - content) / 2 + ascent;
}

/** Tracked text as one path: each character drawn and advanced by its width plus the tracking. */
function trackedPath(font: Font, text: string, x: number, y: number, size: number, trackingEm: number): string {
  let cursor = x;
  const parts: string[] = [];
  for (const ch of text) {
    parts.push(font.getPath(ch, cursor, y, size).toPathData(2));
    cursor += font.getAdvanceWidth(ch, size) + trackingEm * size;
  }
  return parts.join('');
}

export class HeadlineDoesNotFit extends Error {
  constructor() {
    super('headline does not fit the card at the minimum size');
  }
}

/**
 * The text panel as an SVG the size of the card: the kicker and the headline,
 * left-aligned and vertically centred as one block, every glyph a path. No
 * <text> element and no font-family anywhere, so rasterising it looks nothing
 * up. Throws HeadlineDoesNotFit when the headline does not fit.
 */
export function headlineCardSvg(text: CardText, geometry: CardGeometry, fonts: CardFonts): string {
  const fit = fitCardHeadline(text.headline, geometry, fonts);
  if (!fit) throw new HeadlineDoesNotFit();
  const { kicker: k, headline: h } = geometry;
  const kickerHeight = text.kicker ? k.size * 1.2 + k.gap : 0;
  const block = kickerHeight + fit.lines.length * fit.size * h.lineHeight;
  let top = (geometry.height - block) / 2;
  const paths: string[] = [];
  if (text.kicker) {
    const y = baselineIn(fonts.kicker, top, k.size, 1.2);
    paths.push(`<path fill="${CARD_KICKER_HEX}" d="${trackedPath(fonts.kicker, text.kicker.toUpperCase(), geometry.text.left, y, k.size, k.tracking)}"/>`);
    top += kickerHeight;
  }
  const d = fit.lines
    .map((line, i) => {
      const y = baselineIn(fonts.headline, top + i * fit.size * h.lineHeight, fit.size, h.lineHeight);
      return fonts.headline.getPath(line, geometry.text.left, y, fit.size, { kerning: true }).toPathData(2);
    })
    .join('');
  paths.push(`<path fill="${CARD_INK_HEX}" d="${d}"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${geometry.width}" height="${geometry.height}" viewBox="0 0 ${geometry.width} ${geometry.height}">${paths.join('')}</svg>`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  return m ? { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) } : { r: 250, g: 250, b: 248 };
}

async function withMark(canvas: Sharp, layers: OverlayOptions[], crop: PlatformCrop, mark: BrandMark): Promise<Buffer> {
  if (mark.enabled) {
    const placement = markPlacement(crop.width, crop.height, mark, markAspect());
    layers.push({ input: await rasteriseMark(placement, mark.opacity), left: placement.left, top: placement.top });
  }
  return canvas.composite(layers).png().toBuffer();
}

function paperCanvas(crop: PlatformCrop, paperHex: string): Sharp {
  return sharp({ create: { width: crop.width, height: crop.height, channels: 3, background: hexToRgb(paperHex) } });
}

/**
 * One platform's headline card: square art flush right on a paper canvas, the
 * text panel's SVG over it, then the mark. The art should already be paper-
 * corrected, so its paper meets the card's without a seam.
 */
export async function composeHeadlineCard(
  art: Buffer,
  text: CardText,
  crop: PlatformCrop,
  mark: BrandMark,
  opts: { card?: CardSettings; fonts?: CardFonts; paperHex?: string } = {},
): Promise<Buffer> {
  const geometry = cardLayout(crop.platform, opts.card, { width: crop.width, height: crop.height });
  const svg = headlineCardSvg(text, geometry, opts.fonts ?? loadCardFonts());
  const square = await sharp(art).resize(geometry.art.size, geometry.art.size, { fit: 'cover', position: 'centre' }).png().toBuffer();
  return withMark(
    paperCanvas(crop, opts.paperHex ?? CARD_PAPER_HEX),
    [
      { input: square, left: geometry.art.left, top: geometry.art.top },
      { input: Buffer.from(svg), left: 0, top: 0 },
    ],
    crop,
    mark,
  );
}

/**
 * The image-only card made from square art, for when the type cannot be set
 * after a square render (fonts failed, or a founder turned the headline off):
 * the art at full height, centred on paper, then the mark.
 */
export async function composeSquareImageOnly(
  art: Buffer,
  crop: PlatformCrop,
  mark: BrandMark,
  paperHex: string = CARD_PAPER_HEX,
): Promise<Buffer> {
  const side = crop.height;
  const square = await sharp(art).resize(side, side, { fit: 'cover', position: 'centre' }).png().toBuffer();
  return withMark(paperCanvas(crop, paperHex), [{ input: square, left: Math.round((crop.width - side) / 2), top: 0 }], crop, mark);
}
