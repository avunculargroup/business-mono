'use client';

import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import type { Annotation } from '@/lib/annotations';
import { useAnnotationView } from '@/providers/AnnotationProvider';
import styles from './AnnotationOverlay.module.css';

interface Placed {
  annotation: Annotation;
  rect: { top: number; left: number; width: number; height: number };
}

/**
 * Where each annotation's target currently sits on screen.
 *
 * Measured rather than declared: the target is found by its
 * `data-annotation-id`, which means a marker cannot drift away from the thing
 * it describes as the page is edited — if the attribute is gone, so is the
 * marker. Re-measured on resize and scroll because the layer is viewport-fixed.
 */
function useTargets(annotations: Annotation[], active: boolean): Placed[] {
  const [placed, setPlaced] = useState<Placed[]>([]);

  const measure = useCallback(() => {
    if (!active) {
      setPlaced([]);
      return;
    }

    const next: Placed[] = [];
    for (const annotation of annotations) {
      const target = document.querySelector(`[data-annotation-id="${annotation.targetSelector}"]`);
      if (!target) continue;
      const { top, left, width, height } = target.getBoundingClientRect();
      next.push({ annotation, rect: { top, left, width, height } });
    }
    setPlaced(next);
  }, [annotations, active]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!active) return;

    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [active, measure]);

  return placed;
}

/**
 * The architecture overlay.
 *
 * Renders nothing in Product view — not a hidden layer, nothing at all, so
 * there is no chance of it affecting the page it is not being shown over.
 *
 * Markers are real buttons in annotation order, so tabbing through them works
 * without any key handling of our own; the only key this component listens for
 * is Escape, to close the panel.
 */
export function AnnotationOverlay({ annotations }: { annotations: Annotation[] }) {
  const { view, openId, setOpenId } = useAnnotationView();
  const active = view === 'architecture';
  const placed = useTargets(annotations, active);

  useEffect(() => {
    if (!active || !openId) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, openId, setOpenId]);

  if (!active) return null;

  const open = placed.find((item) => item.annotation.id === openId)?.annotation ?? null;

  return (
    <div className={styles.layer}>
      {placed.map(({ annotation, rect }, index) => (
        <div key={annotation.id}>
          <div
            className={styles.outline}
            style={{ top: rect.top - 4, left: rect.left - 4, width: rect.width + 8, height: rect.height + 8 }}
            aria-hidden
          />
          <button
            type="button"
            className={`${styles.marker} ${openId === annotation.id ? styles.markerActive : ''}`}
            style={{ top: rect.top - 14, left: rect.left - 14 }}
            onClick={() => setOpenId(openId === annotation.id ? null : annotation.id)}
            aria-expanded={openId === annotation.id}
            // The number is the visible label but says nothing on its own, so
            // the accessible name carries the title instead.
            aria-label={`Annotation ${index + 1}: ${annotation.title}`}
          >
            {index + 1}
          </button>
        </div>
      ))}

      {open ? (
        <aside className={styles.panel} aria-label={open.title}>
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>{open.title}</h2>
            <button
              type="button"
              className={styles.close}
              onClick={() => setOpenId(null)}
              aria-label="Close annotation"
            >
              <X size={18} strokeWidth={1.5} aria-hidden />
            </button>
          </div>
          <p className={styles.panelBody}>{open.body}</p>
          <Link href={`/architecture#${open.principle}`} className={styles.panelLink}>
            Read the reasoning behind this
          </Link>
        </aside>
      ) : null}
    </div>
  );
}
