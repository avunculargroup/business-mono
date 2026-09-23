/**
 * Product gallery helpers. Pure — no client, no DOM beyond a rect.
 *
 * An image's focal point is a percentage pair from the top-left corner. It
 * feeds CSS `object-position`, so one stored point crops the same file into a
 * square tile or a wide banner, keeping the subject in frame in both.
 */

export type ProductImage = {
  id: string;
  storage_path: string;
  filename: string | null;
  alt_text: string | null;
  width: number | null;
  height: number | null;
  focal_x: number;
  focal_y: number;
  sort_order: number;
  created_at: string;
  /** Signed URL, resolved on the server. Null if signing failed. */
  url: string | null;
};

export type ImageShape = 'square' | 'wide';

export const SHAPE_RATIO: Record<ImageShape, string> = {
  square: '1 / 1',
  wide: '16 / 9',
};

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export function clampFocal(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.round(Math.min(100, Math.max(0, value)));
}

export function objectPosition(image: Pick<ProductImage, 'focal_x' | 'focal_y'>): string {
  return `${clampFocal(Number(image.focal_x))}% ${clampFocal(Number(image.focal_y))}%`;
}

/** The focal point under a pointer, given the rendered image's bounding box. */
export function focalFromPoint(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 50, y: 50 };
  return {
    x: clampFocal(((clientX - rect.left) / rect.width) * 100),
    y: clampFocal(((clientY - rect.top) / rect.height) * 100),
  };
}

const NUDGE: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Arrow keys move the point 1%, or 10% with Shift. Null for any other key. */
export function nudgeFocal(
  point: { x: number; y: number },
  key: string,
  shift: boolean,
): { x: number; y: number } | null {
  const step = NUDGE[key];
  if (!step) return null;
  const size = shift ? 10 : 1;
  return { x: clampFocal(point.x + step[0] * size), y: clampFocal(point.y + step[1] * size) };
}

/** Gallery order: explicit sort order, then upload order. */
export function sortImages<T extends Pick<ProductImage, 'sort_order' | 'created_at'>>(images: T[]): T[] {
  return [...images].sort(
    (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}

/**
 * The image that represents the product: the one picked as featured, else the
 * first in the gallery. The fallback covers a featured image being deleted,
 * which clears the pointer in the database.
 */
export function pickFeatured<T extends Pick<ProductImage, 'id' | 'sort_order' | 'created_at'>>(
  images: T[],
  featuredId: string | null,
): T | null {
  if (images.length === 0) return null;
  return images.find((img) => img.id === featuredId) ?? sortImages(images)[0]!;
}
