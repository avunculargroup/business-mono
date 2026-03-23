import styles from './SkeletonLoader.module.css';

interface SkeletonLoaderProps {
  lines?: number;
  height?: string;
}

export function SkeletonLoader({ lines = 5, height = '16px' }: SkeletonLoaderProps) {
  return (
    <div className={styles.container}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={styles.line}
          style={{
            height,
            width: `${60 + Math.random() * 40}%`,
          }}
        />
      ))}
    </div>
  );
}
