'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import styles from '@/app/(app)/brand/voice.module.css';

interface ChipFieldProps {
  label: string;
  hint?: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Chips that are inherited/enforced and cannot be removed here (e.g. company-banned words). */
  lockedValues?: string[];
  lowercase?: boolean;
}

/**
 * Discrete chip input — each term is a real, removable object, not a comma
 * string. This is what the union/override logic needs (a pasted "a, b, c" must
 * not become one chip). Locked chips render without a remove control.
 */
export function ChipField({
  label,
  hint,
  values,
  onChange,
  placeholder,
  lockedValues = [],
  lowercase = false,
}: ChipFieldProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = lowercase ? input.trim().toLowerCase() : input.trim();
    if (v && !values.includes(v) && !lockedValues.includes(v)) onChange([...values, v]);
    setInput('');
  };

  return (
    <div className={styles.field}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.chipArea}>
        {lockedValues.map((chip) => (
          <span key={`locked-${chip}`} className={`${styles.chip} ${styles.chipLocked}`} title="Enforced from company canon">
            {chip}
          </span>
        ))}
        {values.map((chip) => (
          <span key={chip} className={styles.chip}>
            {chip}
            <button
              type="button"
              className={styles.chipRemove}
              onClick={() => onChange(values.filter((c) => c !== chip))}
              aria-label={`Remove ${chip}`}
            >
              <X size={12} strokeWidth={2} />
            </button>
          </span>
        ))}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          onBlur={add}
          placeholder={values.length === 0 && lockedValues.length === 0 ? placeholder : 'Add another…'}
          className={styles.chipInput}
        />
      </div>
      {hint && <span className={styles.hint}>{hint}</span>}
    </div>
  );
}
