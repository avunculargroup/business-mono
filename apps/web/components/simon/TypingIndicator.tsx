import { Bot } from 'lucide-react';
import styles from './TypingIndicator.module.css';

export function TypingIndicator() {
  return (
    <div className={styles.wrapper}>
      <div className={styles.label}>
        <Bot size={16} strokeWidth={1.5} />
        <span>Simon</span>
      </div>
      <div className={styles.bubble}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
