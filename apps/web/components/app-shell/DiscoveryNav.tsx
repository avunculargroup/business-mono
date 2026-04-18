'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SectionNav.module.css';

const tabs = [
  { href: '/discovery/lexicon',   label: 'Lexicon'   },
  { href: '/discovery/templates', label: 'Templates' },
  { href: '/discovery/feedback',  label: 'Feedback'  },
  { href: '/discovery/pipeline',  label: 'Pipeline'  },
];

export function DiscoveryNav() {
  const pathname = usePathname();
  return (
    <nav className={styles.nav} aria-label="Discovery sections">
      {tabs.map(tab => (
        <Link
          key={tab.href}
          href={tab.href}
          className={`${styles.tab} ${pathname.startsWith(tab.href) ? styles.tabActive : ''}`}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
