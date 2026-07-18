'use client';

import { useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import styles from './TagInput.module.css';
import formStyles from './Form.module.css';

/**
 * A labelled chip/tag input for forms. Manages an array of string tags — add on
 * Enter/comma, remove via the chip button or Backspace on an empty input — and
 * writes the tags as a JSON string in a hidden field so a plain `<form action>`
 * submission carries them (the server action parses the JSON). Consolidates the
 * chip inputs previously hand-rolled in InterviewForm, FeedbackForm, RoutineForm,
 * and FilesView.
 */

interface TagInputProps {
  /** Hidden field name; its value is JSON.stringify(tags). */
  name: string;
  label: string;
  defaultValue?: string[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Normalise each entry before adding (e.g. lowercase). Defaults to trim. */
  transform?: (raw: string) => string;
}

export function TagInput({
  name,
  label,
  defaultValue = [],
  placeholder,
  hint,
  required,
  transform = (raw) => raw.trim(),
}: TagInputProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const add = () => {
    const value = transform(input);
    if (value && !tags.includes(value)) setTags((prev) => [...prev, value]);
    setInput('');
    inputRef.current?.focus();
  };

  const remove = (tag: string) => setTags((prev) => prev.filter((t) => t !== tag));

  return (
    <div className={formStyles.field}>
      <label htmlFor={id} className={formStyles.label}>
        {label}
        {required && <span className={formStyles.required}> *</span>}
      </label>
      <div className={styles.chipArea} onClick={() => inputRef.current?.focus()}>
        {tags.map((tag) => (
          <span key={tag} className={styles.chip}>
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
          ref={inputRef}
          id={id}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            } else if (e.key === 'Backspace' && !input && tags.length > 0) {
              remove(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? placeholder : 'Add another…'}
          className={styles.chipInput}
          aria-describedby={hintId}
        />
      </div>
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
      {hint && (
        <p id={hintId} className={formStyles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
