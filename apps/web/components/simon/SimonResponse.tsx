import { Bot } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import styles from './SimonResponse.module.css';

interface SimonResponseProps {
  message: {
    content: string;
    timestamp: string;
  };
}

export function SimonResponse({ message }: SimonResponseProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        <Bot size={16} strokeWidth={1.5} />
        <span>Simon</span>
      </div>
      <div className={styles.bubble}>
        <p className={styles.content}>{message.content}</p>
      </div>
      <span className={styles.timestamp}>{formatDateTime(message.timestamp)}</span>
    </div>
  );
}
