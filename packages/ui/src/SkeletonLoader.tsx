import styles from './SkeletonLoader.module.css';

interface SkeletonLoaderProps {
  lines?: number;
  height?: string;
}

// Deterministic widths so the server and client render the same markup
// (Math.random would cause a hydration mismatch in Suspense fallbacks).
const WIDTHS = [82, 68, 91, 74, 60, 88, 70, 95, 66, 84];

export function SkeletonLoader({ lines = 5, height = '16px' }: SkeletonLoaderProps) {
  return (
    <div className={styles.container} role="status" aria-label="Loading" aria-busy="true">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={styles.line}
          style={{ height, width: `${WIDTHS[i % WIDTHS.length]}%` }}
        />
      ))}
    </div>
  );
}
