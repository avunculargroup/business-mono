'use client';

import { useState, useEffect, useCallback } from 'react';
import { SlideFrame } from '@/components/slides/primitives/SlideFrame';
import { SlideView } from '@/components/slides/templates/SlideView';
import { getTheme, SLIDE_WIDTH, SLIDE_HEIGHT } from '@/lib/decks/theme';
import { parseSlideContent } from '@/lib/decks/schema';
import type { DeckRow, DeckSlideRow } from '@/lib/decks/schema';
import styles from './PresentMode.module.css';

interface PresentModeProps {
  deck: DeckRow;
  slides: DeckSlideRow[];
}

export function PresentMode({ deck, slides }: PresentModeProps) {
  const theme = getTheme(deck.theme_id);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [showControls, setShowControls] = useState(true);
  const [controlsTimeout, setControlsTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const total = slides.length;
  const current = slides[currentIndex];
  const parsed = current ? parseSlideContent(current) : null;
  const scale = viewportSize.w > 0
    ? Math.min(viewportSize.w / SLIDE_WIDTH, viewportSize.h / SLIDE_HEIGHT)
    : 0;

  useEffect(() => {
    function onResize() {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const next = useCallback(() => setCurrentIndex((i) => Math.min(i + 1, total - 1)), [total]);
  const prev = useCallback(() => setCurrentIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') next();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') prev();
      if (e.key === 'Escape') window.close();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [next, prev]);

  function handleMouseMove() {
    setShowControls(true);
    if (controlsTimeout) clearTimeout(controlsTimeout);
    const t = setTimeout(() => setShowControls(false), 2500);
    setControlsTimeout(t);
  }

  if (total === 0) {
    return (
      <div className={styles.empty}>
        <p>This deck has no slides yet.</p>
      </div>
    );
  }

  return (
    <div className={styles.stage} onMouseMove={handleMouseMove} onClick={next}>
      {parsed && scale > 0 && (
        <div
          className={styles.slide}
          style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: SLIDE_WIDTH, height: SLIDE_HEIGHT }}>
            <SlideFrame theme={theme}>
              <SlideView slide={parsed} theme={theme} slideIndex={currentIndex + 1} slideCount={total} deckLabel={deck.title} />
            </SlideFrame>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`${styles.controls} ${showControls ? styles.visible : ''}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); prev(); }} disabled={currentIndex === 0} className={styles.navBtn} aria-label="Previous slide">
          ‹
        </button>
        <span className={styles.counter}>{currentIndex + 1} / {total}</span>
        <button type="button" onClick={(e) => { e.stopPropagation(); next(); }} disabled={currentIndex === total - 1} className={styles.navBtn} aria-label="Next slide">
          ›
        </button>
      </div>

      {/* Progress bar */}
      <div className={styles.progressBar}>
        <div
          className={styles.progressFill}
          style={{ width: `${((currentIndex + 1) / total) * 100}%` }}
        />
      </div>
    </div>
  );
}
