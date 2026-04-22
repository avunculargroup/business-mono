'use client';

import { SlideType, SLIDE_TYPE_LABELS } from '@platform/shared';
import type { SlideType as SlideTypeValue } from '@platform/shared';
import styles from './TemplatePicker.module.css';

interface TemplatePickerProps {
  onSelect: (type: SlideTypeValue) => void;
  onClose: () => void;
}

const TEMPLATE_DESCRIPTIONS: Record<SlideTypeValue, string> = {
  title:         'Opening slide with headline and presenter info',
  section:       'Dark section divider with section number',
  agenda:        'Numbered agenda list with optional durations',
  two_column:    'Side-by-side columns for comparisons',
  image_caption: 'Full image with optional caption',
  kpi_grid:      'Grid of metrics with values and changes',
  quote:         'Highlighted quote with attribution',
  closing:       'Dark closing slide with CTA and contact details',
};

const SLIDE_TYPES = Object.values(SlideType) as SlideTypeValue[];

export function TemplatePicker({ onSelect, onClose }: TemplatePickerProps) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Choose a template</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className={styles.grid}>
          {SLIDE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.card}
              onClick={() => { onSelect(type); onClose(); }}
            >
              <div className={styles.cardLabel}>{SLIDE_TYPE_LABELS[type]}</div>
              <div className={styles.cardDesc}>{TEMPLATE_DESCRIPTIONS[type]}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
