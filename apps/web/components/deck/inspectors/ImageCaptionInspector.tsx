'use client';

import { useState } from 'react';
import type { z } from 'zod';
import type { ImageCaptionContent } from '@/lib/decks/schema';
import { InspectorField, useSaveField, type InspectorBaseProps } from './shared';
import { AssetPicker } from '@/components/slides/editors/AssetPicker';

interface Props extends InspectorBaseProps {
  content: z.infer<typeof ImageCaptionContent>;
}

export function ImageCaptionInspector({ content, deckId, slideId, onContentChange }: Props) {
  const save = useSaveField(deckId, slideId, onContentChange);
  const [title, setTitle] = useState(content.title);
  const [caption, setCaption] = useState(content.caption);
  const [captionPosition, setCaptionPosition] = useState(content.captionPosition);
  const [focalPointX, setFocalPointX] = useState(content.focalPointX);
  const [focalPointY, setFocalPointY] = useState(content.focalPointY);
  const [assetId, setAssetId] = useState(content.assetId);

  function handleAssetSelected(id: string) {
    setAssetId(id);
    save({ assetId: id });
  }

  return (
    <>
      <InspectorField label="Slide title" value={title} onChange={setTitle} onBlur={() => save({ title })} placeholder="Optional title..." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Image</label>
        <AssetPicker selectedAssetId={assetId} onSelect={handleAssetSelected} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Focal point X ({focalPointX}%)</label>
        <input type="range" min={0} max={100} value={focalPointX}
          onChange={(e) => setFocalPointX(Number(e.target.value))}
          onMouseUp={() => save({ focalPointX })}
          onTouchEnd={() => save({ focalPointX })}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Focal point Y ({focalPointY}%)</label>
        <input type="range" min={0} max={100} value={focalPointY}
          onChange={(e) => setFocalPointY(Number(e.target.value))}
          onMouseUp={() => save({ focalPointY })}
          onTouchEnd={() => save({ focalPointY })}
          style={{ width: '100%' }}
        />
      </div>

      <InspectorField label="Caption" value={caption} onChange={setCaption} onBlur={() => save({ caption })} placeholder="Image caption..." multiline />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Caption position</label>
        <select
          value={captionPosition}
          onChange={(e) => { const v = e.target.value as 'below' | 'overlay'; setCaptionPosition(v); save({ captionPosition: v }); }}
          style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', padding: '6px 8px', fontSize: 'var(--text-sm)', background: 'var(--color-surface-subtle)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-body)' }}
        >
          <option value="below">Below image</option>
          <option value="overlay">Overlay</option>
        </select>
      </div>
    </>
  );
}
