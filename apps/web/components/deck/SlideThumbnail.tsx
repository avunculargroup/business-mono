'use client';

import { memo } from 'react';
import { SlideFrame } from '@/components/slides/primitives/SlideFrame';
import { SlideView } from '@/components/slides/templates/SlideView';
import type { Slide } from '@/lib/decks/schema';
import type { SlideTheme } from '@/lib/decks/theme';
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '@/lib/decks/theme';
import styles from './SlideThumbnail.module.css';

interface SlideThumbnailProps {
  slide: Slide;
  theme: SlideTheme;
  thumbnailWidth?: number;
  isSelected?: boolean;
  slideNumber?: number;
  onClick?: () => void;
}

export const SlideThumbnail = memo(function SlideThumbnail({
  slide,
  theme,
  thumbnailWidth = 180,
  isSelected = false,
  slideNumber,
  onClick,
}: SlideThumbnailProps) {
  const scale = thumbnailWidth / SLIDE_WIDTH;
  const thumbnailHeight = SLIDE_HEIGHT * scale;

  return (
    <button
      type="button"
      className={`${styles.thumbnail} ${isSelected ? styles.selected : ''}`}
      onClick={onClick}
      title={`Slide ${slideNumber}`}
    >
      {slideNumber !== undefined && (
        <span className={styles.number}>{slideNumber}</span>
      )}
      <div
        className={styles.canvas}
        style={{ width: thumbnailWidth, height: thumbnailHeight }}
      >
        <div style={{ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <SlideFrame theme={theme}>
            <SlideView slide={slide} theme={theme} />
          </SlideFrame>
        </div>
      </div>
    </button>
  );
});
