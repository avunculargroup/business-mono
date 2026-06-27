'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { useToast } from '@/providers/ToastProvider';
import styles from './CopyButton.module.css';

export function CopyButton({ text, label }: { text: string; label: string }) {
  const { success, error } = useToast();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      success('Copied to clipboard.');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      error('Could not copy — select the text and copy manually.');
    }
  };
  return (
    <button type="button" className={styles.btn} onClick={copy}>
      {copied ? <Check size={14} strokeWidth={1.5} /> : <Copy size={14} strokeWidth={1.5} />}
      {label}
    </button>
  );
}
