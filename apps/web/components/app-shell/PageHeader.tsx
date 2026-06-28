import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}

export function PageHeader({ title, backHref, backLabel = 'Back', children }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <Link href={backHref} className={styles.back} aria-label={backLabel}>
            <ChevronLeft size={18} strokeWidth={1.5} />
            <span>{backLabel}</span>
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  );
}
