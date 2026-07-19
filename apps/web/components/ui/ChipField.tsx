'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import styles from './TagInput.module.css';

/**
 * Controlled chip/tag input primitive: renders a value array as removable chips
 * with an inline entry field. The parent owns the array (value/onChange). This
 * is the shared core behind the form-oriented `TagInput` and the controlled
 * chip inputs in RoutineForm and FilesView.
 */

interface ChipFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Normalise each entry before adding (e.g. lowercase). Defaults to trim. */
  transform?: (raw: string) => string;
  /** Also commit the pending entry when the input loses focus. */
  addOnBlur?: boolean;
  /** Wiring for an external <label htmlFor>. */
  id?: string;
  'aria-describedby'?: string;
}

export function ChipField({
  value,
  onChange,
  placeholder,
  transform = (raw) => raw.trim(),
  addOnBlur = false,
  id,
  'aria-describedby': ariaDescribedby,
}: ChipFieldProps) {
  const [input, setInput] = useState('');

  const add = () => {
    const next = transform(input);
    if (next && !value.includes(next)) onChange([...value, next]);
    setInput('');
  };

  const remove = (tag: string) => onChange(value.filter((t) => t !== tag));

  return (
    <div className={styles.chipArea}>
      {value.map((tag, i) => (
        <span key={`${tag}-${i}`} className={styles.chip}>
          {tag}
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => remove(tag)}
            aria-label={`Remove "${tag}"`}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
      <input
        id={id}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !input && value.length > 0) {
            remove(value[value.length - 1]);
          }
        }}
        onBlur={addOnBlur ? add : undefined}
        placeholder={value.length === 0 ? placeholder : 'Add another…'}
        className={styles.chipInput}
        aria-describedby={ariaDescribedby}
      />
    </div>
  );
}
