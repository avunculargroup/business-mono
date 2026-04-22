'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { AgendaContent } from '@/lib/decks/schema';
import { useSaveField, InspectorField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof AgendaContent>;
}

export function AgendaInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [title, setTitle] = useState(content.title);
  const [items, setItems] = useState(content.items);

  function updateItem(i: number, field: 'label' | 'duration', value: string) {
    const next = items.map((item, idx) => idx === i ? { ...item, [field]: value } : item);
    setItems(next);
    return next;
  }

  function addItem() {
    const next = [...items, { label: '', duration: '' }];
    setItems(next);
    save({ items: next });
  }

  function removeItem(i: number) {
    const next = items.filter((_, idx) => idx !== i);
    setItems(next);
    save({ items: next });
  }

  return (
    <>
      <InspectorField label="Section title" value={title} onChange={setTitle} onBlur={() => save({ title })} placeholder="Agenda" />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          Items
        </label>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={item.label}
              onChange={(e) => updateItem(i, 'label', e.target.value)}
              onBlur={() => save({ items })}
              placeholder="Agenda item..."
              style={{ flex: 1, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)' }}
            />
            <input
              type="text"
              value={item.duration ?? ''}
              onChange={(e) => updateItem(i, 'duration', e.target.value)}
              onBlur={() => save({ items })}
              placeholder="5 min"
              style={{ width: 64, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)' }}
            />
            <button type="button" onClick={() => removeItem(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 16 }}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addItem} style={{ alignSelf: 'flex-start', fontSize: 'var(--text-sm)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Add item
        </button>
      </div>
    </>
  );
}
