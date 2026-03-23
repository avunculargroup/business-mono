import { formatDateTime } from '@/lib/utils';
import styles from './DirectorMessage.module.css';

interface DirectorMessageProps {
  message: {
    content: string;
    source?: string;
    timestamp: string;
  };
}

export function DirectorMessage({ message }: DirectorMessageProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.bubble}>
        <p className={styles.content}>{message.content}</p>
      </div>
      <div className={styles.meta}>
        {message.source && <span className={styles.source}>{message.source}</span>}
        <span className={styles.timestamp}>{formatDateTime(message.timestamp)}</span>
      </div>
    </div>
  );
}
