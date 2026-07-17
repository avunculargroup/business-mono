import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';
import styles from './Form.module.css';

/**
 * Shared form field primitives. Each pairs a `<label>` with its control and
 * wires `htmlFor`/`id` plus `aria-describedby`/`aria-invalid` in one place, so
 * every consumer gets associated labels and accessible error/hint text for free
 * — closing the unassociated-label gap that ~47 hand-rolled forms carried.
 */

function describedBy(hintId?: string, errorId?: string): string | undefined {
  return [hintId, errorId].filter(Boolean).join(' ') || undefined;
}

/** Two-up responsive grid row. Collapses to a single column on mobile. */
export function FormRow({ children }: { children: ReactNode }) {
  return <div className={styles.row}>{children}</div>;
}

/** Form-level error (submission failure), rendered once at the foot of a form. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className={styles.formError}>
      {children}
    </p>
  );
}

type FieldMeta = { label: string; hint?: string; error?: string };

interface FormFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>, FieldMeta {
  name: string;
}

export function FormField({ label, hint, error, required, className, ...inputProps }: FormFieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <input
        id={id}
        required={required}
        aria-describedby={describedBy(hintId, errorId)}
        aria-invalid={error ? true : undefined}
        className={cn(styles.input, className)}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

interface FormTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>,
    FieldMeta {
  name: string;
}

export function FormTextarea({
  label,
  hint,
  error,
  required,
  className,
  ...textareaProps
}: FormTextareaProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <textarea
        id={id}
        required={required}
        aria-describedby={describedBy(hintId, errorId)}
        aria-invalid={error ? true : undefined}
        className={cn(styles.textarea, className)}
        {...textareaProps}
      />
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}

interface FormSelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>, FieldMeta {
  name: string;
  children: ReactNode;
}

export function FormSelect({
  label,
  hint,
  error,
  required,
  className,
  children,
  ...selectProps
}: FormSelectProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        {required && <span className={styles.required}> *</span>}
      </label>
      <select
        id={id}
        required={required}
        aria-describedby={describedBy(hintId, errorId)}
        aria-invalid={error ? true : undefined}
        className={cn(styles.select, className)}
        {...selectProps}
      >
        {children}
      </select>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
