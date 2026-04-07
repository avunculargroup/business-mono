'use client';

import { X } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import styles from './Toast.module.css';

export function Toast() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          <span className={styles.message}>{toast.message}</span>
          {toast.action && (
            <button
              className={styles.action}
              onClick={() => {
                toast.action!.onClick();
                dismiss(toast.id);
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button className={styles.close} onClick={() => dismiss(toast.id)}>
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  );
}
