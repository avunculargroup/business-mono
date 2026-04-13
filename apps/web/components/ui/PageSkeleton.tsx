import styles from './PageSkeleton.module.css';

interface PageSkeletonProps {
  hasToolbar?: boolean;
  rows?: number;
}

export function PageSkeleton({ hasToolbar = true, rows = 6 }: PageSkeletonProps) {
  return (
    <div className={styles.page}>
      {hasToolbar && (
        <div className={styles.toolbar}>
          <div className={styles.titleBlock} />
          <div className={styles.buttonBlock} />
        </div>
      )}
      <div className={styles.content}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className={styles.row}>
            <div className={styles.cell} style={{ width: `${30 + (i % 3) * 15}%` }} />
            <div className={styles.cell} style={{ width: '15%' }} />
            <div className={styles.cell} style={{ width: '20%' }} />
            <div className={styles.cell} style={{ width: '12%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
