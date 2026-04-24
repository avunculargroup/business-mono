'use client';

import { memo, useState, useRef, useEffect } from 'react';
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
  onDelete?: () => void;
}

export const SlideThumbnail = memo(function SlideThumbnail({
  slide,
  theme,
  thumbnailWidth = 180,
  isSelected = false,
  slideNumber,
  onClick,
  onDelete,
}: SlideThumbnailProps) {
  const scale = thumbnailWidth / SLIDE_WIDTH;
  const thumbnailHeight = SLIDE_HEIGHT * scale;
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setShowMenu(!showMenu);
  }

  function handleDelete() {
    if (!confirm('Delete this slide?')) return;
    setShowMenu(false);
    onDelete?.();
  }

  return (
    <div className={styles.container} ref={menuRef}>
      <button
        type="button"
        className={`${styles.thumbnail} ${isSelected ? styles.selected : ''}`}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        title={`Slide ${slideNumber} (right-click to delete)`}
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
        {onDelete && (
          <button
            type="button"
            className={styles.deleteBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleDelete();
            }}
            title="Delete slide"
            aria-label="Delete slide"
          >
            ✕
          </button>
        )}
      </button>

      {showMenu && onDelete && (
        <div className={styles.contextMenu}>
          <button type="button" onClick={handleDelete} className={styles.contextMenuItem}>
            Delete slide
          </button>
        </div>
      )}
    </div>
  );
});
