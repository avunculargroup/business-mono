'use client';

import { updateSlide } from '@/app/actions/decks';
import { useToast } from '@/providers/ToastProvider';

export interface InspectorBaseProps {
  deckId: string;
  slideId: string;
  onContentChange: (patch: Record<string, unknown>) => void;
}

/** Save a single field patch to the server and notify the parent optimistically. */
export function useSaveField(deckId: string, slideId: string, onContentChange: (patch: Record<string, unknown>) => void) {
  const toast = useToast();

  return async function saveField(patch: Record<string, unknown>) {
    onContentChange(patch);
    const res = await updateSlide(deckId, slideId, patch);
    if ('error' in res) toast.error(res.error);
  };
}

/** Simple labelled text input for inspector panels. */
export function InspectorField({
  label,
  value,
  onChange,
  onBlur,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const base: React.CSSProperties = {
    width: '100%',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: '8px 10px',
    fontSize: 'var(--text-sm)',
    fontFamily: 'var(--font-body)',
    color: 'var(--color-text-primary)',
    background: 'var(--color-surface-subtle)',
    boxSizing: 'border-box' as const,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {multiline ? (
        <textarea
          style={{ ...base, resize: 'vertical', minHeight: 72 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          rows={3}
        />
      ) : (
        <input
          type="text"
          style={base}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      )}
    </div>
  );
}
