'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@platform/ui/Modal';
import { Button } from '@platform/ui/Button';
import { focalFromPoint, nudgeFocal, type ProductImage } from '@/lib/products/images';
import { ProductImageFrame } from './ProductImageFrame';
import styles from './productImages.module.css';

interface ProductImagePositionerProps {
  image: ProductImage | null;
  productName: string;
  saving: boolean;
  onClose: () => void;
  onSave: (point: { x: number; y: number }) => void;
}

/**
 * Set an image's focal point: click or drag on the full image, or use the
 * arrow keys. Square and wide previews update live so both crops can be
 * checked before saving.
 */
export function ProductImagePositioner({ image, productName, saving, onClose, onSave }: ProductImagePositionerProps) {
  const [point, setPoint] = useState({ x: 50, y: 50 });
  const [dragging, setDragging] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (image) setPoint({ x: Number(image.focal_x), y: Number(image.focal_y) });
  }, [image]);

  function moveTo(clientX: number, clientY: number) {
    const el = imgRef.current;
    if (!el) return;
    setPoint(focalFromPoint(el.getBoundingClientRect(), clientX, clientY));
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    moveTo(e.clientX, e.clientY);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (dragging) moveTo(e.clientX, e.clientY);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const next = nudgeFocal(point, e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    setPoint(next);
  }

  const draft = image ? { ...image, focal_x: point.x, focal_y: point.y } : null;

  return (
    <Modal
      open={image !== null}
      onClose={onClose}
      title="Position image"
      footer={
        <>
          <Button variant="ghost" onClick={() => setPoint({ x: 50, y: 50 })} disabled={saving}>
            Reset to centre
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => onSave(point)} loading={saving}>Save position</Button>
        </>
      }
    >
      {draft && (
        <div className={styles.positioner}>
          <p className={styles.hint}>
            Click or drag to mark what must stay in frame. Arrow keys move it 1%, Shift + arrow 10%.
          </p>

          <div
            className={styles.stage}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={() => setDragging(false)}
            onPointerCancel={() => setDragging(false)}
            data-dragging={dragging || undefined}
          >
            <div className={styles.stageInner}>
              {draft.url && (
                <img
                  ref={imgRef}
                  src={draft.url}
                  alt={draft.alt_text ?? productName}
                  className={styles.stageImg}
                  draggable={false}
                />
              )}
              <button
                type="button"
                className={styles.marker}
                style={{ left: `${point.x}%`, top: `${point.y}%` }}
                onKeyDown={handleKeyDown}
                aria-label={`Focal point, ${point.x}% across, ${point.y}% down. Use the arrow keys to move it.`}
              />
            </div>
          </div>

          <div className={styles.previews}>
            <figure className={styles.preview}>
              <ProductImageFrame image={draft} shape="square" label={productName} />
              <figcaption>Square</figcaption>
            </figure>
            <figure className={styles.preview}>
              <ProductImageFrame image={draft} shape="wide" label={productName} />
              <figcaption>Wide, 16:9</figcaption>
            </figure>
          </div>

          <span className={styles.coords}>{point.x}% · {point.y}%</span>
        </div>
      )}
    </Modal>
  );
}
