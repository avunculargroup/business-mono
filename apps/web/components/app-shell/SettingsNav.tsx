'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import styles from './SettingsNav.module.css';

const tabs = [
  { href: '/settings/team', label: 'Team Members' },
  { href: '/settings/integrations', label: 'Integrations' },
];

export function SettingsNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="Settings navigation">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${pathname.startsWith(tab.href) ? styles.active : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
