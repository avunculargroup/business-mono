'use client';

import { useState, useRef, useCallback } from 'react';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import styles from './ComposeArea.module.css';

export function ComposeArea() {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = useCallback(async () => {
    if (!message.trim() || sending) return;
    setSending(true);

    // TODO: Implement server action to send directive to Simon
    // For now, just clear the message
    setMessage('');
    setSending(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [message, sending]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 5 * 24; // ~5 lines
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  return (
    <div className={styles.compose}>
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          placeholder="Send a directive to Simon\u2026"
          value={message}
          onChange={(e) => { setMessage(e.target.value); handleInput(); }}
          onKeyDown={handleKeyDown}
          rows={1}
        />
        <Button
          variant="primary"
          size="md"
          loading={sending}
          disabled={!message.trim()}
          onClick={handleSubmit}
        >
          <Send size={16} strokeWidth={1.5} />
          Send
        </Button>
      </div>
      <p className={styles.hint}>
        Simon will propose actions for your approval before executing
      </p>
    </div>
  );
}
