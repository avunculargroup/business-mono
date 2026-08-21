'use client';

import { Layers } from 'lucide-react';
import { useAnnotationView } from '@/providers/AnnotationProvider';
import styles from './ViewToggle.module.css';

/**
 * Product view ⇄ Architecture view.
 *
 * Lives in the chrome and is present on every route, because the reader who
 * wants the explanation may not arrive on the page that has the best one.
 * `aria-pressed` rather than a switch role: this is a button with two states,
 * and the label says which state pressing it produces.
 */
export function ViewToggle() {
  const { view, toggleView } = useAnnotationView();
  const on = view === 'architecture';

  return (
    <button
      type="button"
      className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
      onClick={toggleView}
      aria-pressed={on}
    >
      <Layers size={16} strokeWidth={1.5} aria-hidden />
      {on ? 'Architecture view' : 'Show architecture'}
    </button>
  );
}
