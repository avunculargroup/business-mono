import { describe, it, expect } from 'vitest';
import { clampFocal, focalFromPoint, nudgeFocal, objectPosition, pickFeatured, sortImages } from './images';

const img = (id: string, sort_order: number, created_at: string) => ({ id, sort_order, created_at });

describe('clampFocal', () => {
  it('keeps the point inside the image and rounds to whole percent', () => {
    expect(clampFocal(-5)).toBe(0);
    expect(clampFocal(140)).toBe(100);
    expect(clampFocal(33.6)).toBe(34);
  });

  it('falls back to centre for a non-number', () => {
    expect(clampFocal(Number.NaN)).toBe(50);
  });
});

describe('objectPosition', () => {
  it('formats the point for CSS object-position', () => {
    expect(objectPosition({ focal_x: 20, focal_y: 75 })).toBe('20% 75%');
  });

  it('accepts NUMERIC columns that arrive as strings', () => {
    // PostgREST serialises NUMERIC(5,2) as a JSON number, but a string would
    // otherwise produce "20.00% ..." or NaN silently.
    expect(objectPosition({ focal_x: '20.00' as unknown as number, focal_y: 75 })).toBe('20% 75%');
  });
});

describe('focalFromPoint', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('maps a click to percentages of the rendered image', () => {
    expect(focalFromPoint(rect, 150, 75)).toEqual({ x: 25, y: 25 });
  });

  it('clamps a drag that leaves the image', () => {
    expect(focalFromPoint(rect, 400, 0)).toEqual({ x: 100, y: 0 });
  });

  it('returns centre for an unmeasured image', () => {
    expect(focalFromPoint({ left: 0, top: 0, width: 0, height: 0 }, 10, 10)).toEqual({ x: 50, y: 50 });
  });
});

describe('nudgeFocal', () => {
  it('moves 1% per arrow and 10% with Shift', () => {
    expect(nudgeFocal({ x: 50, y: 50 }, 'ArrowLeft', false)).toEqual({ x: 49, y: 50 });
    expect(nudgeFocal({ x: 50, y: 50 }, 'ArrowDown', true)).toEqual({ x: 50, y: 60 });
  });

  it('stops at the edge', () => {
    expect(nudgeFocal({ x: 95, y: 0 }, 'ArrowRight', true)).toEqual({ x: 100, y: 0 });
  });

  it('ignores other keys', () => {
    expect(nudgeFocal({ x: 50, y: 50 }, 'Enter', false)).toBeNull();
  });
});

describe('pickFeatured', () => {
  const images = [img('b', 1, '2026-01-01'), img('a', 0, '2026-01-02'), img('c', 0, '2026-01-03')];

  it('returns the explicitly featured image', () => {
    expect(pickFeatured(images, 'c')?.id).toBe('c');
  });

  it('falls back to the first in gallery order when none is featured', () => {
    expect(pickFeatured(images, null)?.id).toBe('a');
  });

  it('falls back when the featured id no longer exists', () => {
    expect(pickFeatured(images, 'gone')?.id).toBe('a');
  });

  it('returns null for an empty gallery', () => {
    expect(pickFeatured([], 'a')).toBeNull();
  });
});

describe('sortImages', () => {
  it('orders by sort_order then upload time without mutating the input', () => {
    const images = [img('b', 1, '2026-01-01'), img('c', 0, '2026-01-03'), img('a', 0, '2026-01-02')];
    expect(sortImages(images).map((i) => i.id)).toEqual(['a', 'c', 'b']);
    expect(images[0]!.id).toBe('b');
  });
});
