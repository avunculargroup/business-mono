import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { BtsLogo } from './BtsLogo';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
  logoOnMobile?: boolean;
}

export function PageHeader({ title, backHref, backLabel = 'Back', children, logoOnMobile }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {backHref && (
          <Link href={backHref} className={styles.back} aria-label={backLabel}>
            <ChevronLeft size={18} strokeWidth={1.5} />
            <span>{backLabel}</span>
          </Link>
        )}
        <h1 className={styles.title}>
          {logoOnMobile && (
            <span className={styles.logoLockup}>
              <BtsLogo size={22} />
              <span className={styles.logoWordmark}>HQ</span>
            </span>
          )}
          <span className={logoOnMobile ? styles.titleTextDesktop : undefined}>{title}</span>
        </h1>
      </div>
      {children && <div className={styles.actions}>{children}</div>}
    </header>
  );
}
