'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { KpiGridContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof KpiGridContent>;
}

export function KpiGridInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [title, setTitle] = useState(content.title);
  const [columns, setColumns] = useState<2 | 3 | 4>(content.columns ?? 3);
  const [metrics, setMetrics] = useState(content.metrics);

  function updateMetric(i: number, field: string, value: string | boolean) {
    const next = metrics.map((m, idx) => idx === i ? { ...m, [field]: value } : m);
    setMetrics(next);
    return next;
  }

  function addMetric() {
    const next = [...metrics, { label: '', value: '', change: '', changePositive: true }];
    setMetrics(next);
    save({ metrics: next });
  }

  function removeMetric(i: number) {
    const next = metrics.filter((_, idx) => idx !== i);
    setMetrics(next);
    save({ metrics: next });
  }

  const fieldStyle = { flex: 1, border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)', background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)' };

  return (
    <>
      <InspectorField label="Title" value={title} onChange={setTitle} onBlur={() => save({ title })} placeholder="KPI overview..." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Columns</label>
        <select value={columns} onChange={(e) => { const v = Number(e.target.value) as 2|3|4; setColumns(v); save({ columns: v }); }}
          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 'var(--text-sm)', background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}>
          <option value={2}>2</option>
          <option value={3}>3</option>
          <option value={4}>4</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Metrics</label>
        {metrics.map((m, i) => (
          <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--color-surface-subtle)' }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <input type="text" value={m.label} onChange={(e) => updateMetric(i, 'label', e.target.value)} onBlur={() => save({ metrics })} placeholder="Label" style={fieldStyle} />
              <input type="text" value={m.value} onChange={(e) => updateMetric(i, 'value', e.target.value)} onBlur={() => save({ metrics })} placeholder="42%" style={{ ...fieldStyle, flex: '0 0 80px' }} />
              <button type="button" onClick={() => removeMetric(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-tertiary)', fontSize: 14 }}>✕</button>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="text" value={m.change ?? ''} onChange={(e) => updateMetric(i, 'change', e.target.value)} onBlur={() => save({ metrics })} placeholder="↑ 12%" style={fieldStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                <input type="checkbox" checked={m.changePositive ?? true} onChange={(e) => { updateMetric(i, 'changePositive', e.target.checked); save({ metrics }); }} />
                Positive
              </label>
            </div>
          </div>
        ))}
        <button type="button" onClick={addMetric} style={{ alignSelf: 'flex-start', fontSize: 'var(--text-sm)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          + Add metric
        </button>
      </div>
    </>
  );
}
