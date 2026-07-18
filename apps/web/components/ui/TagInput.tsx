'use client';

import { useId, useState } from 'react';
import { ChipField } from './ChipField';
import formStyles from './Form.module.css';

/**
 * A labelled chip/tag input for forms. Owns the tag array and writes it as a
 * JSON string in a hidden field so a plain `<form action>` submission carries it
 * (the server action parses the JSON). The chip UI/behaviour lives in the shared
 * controlled `ChipField`; this wrapper adds the label + hidden field. Replaces
 * the chip inputs previously hand-rolled in InterviewForm, FeedbackForm,
 * TemplateForm, and CommunityForm.
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

  return (
    <div className={formStyles.field}>
      <label htmlFor={id} className={formStyles.label}>
        {label}
        {required && <span className={formStyles.required}> *</span>}
      </label>
      <ChipField
        id={id}
        value={tags}
        onChange={setTags}
        placeholder={placeholder}
        transform={transform}
        aria-describedby={hintId}
      />
      <input type="hidden" name={name} value={JSON.stringify(tags)} />
      {hint && (
        <p id={hintId} className={formStyles.hint}>
          {hint}
        </p>
      )}
    </div>
  );
}
