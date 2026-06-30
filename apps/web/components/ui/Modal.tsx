'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import styles from './Modal.module.css';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  size?: 'sm' | 'md';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function Modal({ open, onClose, title, size = 'md', children, footer }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  const titleId = useId();

  return (
    <dialog
      ref={dialogRef}
      className={cn(styles.dialog, styles[size])}
      onClose={onClose}
      aria-labelledby={titleId}
    >
      <div className={styles.panel}>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close" type="button">
            <X size={18} strokeWidth={1.5} />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </dialog>
  );
}
