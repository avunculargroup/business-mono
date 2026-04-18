'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './SectionNav.module.css';

const tabs = [
  { href: '/crm/contacts',  label: 'Contacts'  },
  { href: '/crm/companies', label: 'Companies' },
  { href: '/crm/champions', label: 'Champions' },
  { href: '/crm/community', label: 'Community' },
];

// Interviews and Segments are Discovery pages routed under /crm — hide CRM tabs there.
const DISCOVERY_PATHS = ['/crm/interviews', '/crm/segments'];

export function CrmNav() {
  const pathname = usePathname();
  if (DISCOVERY_PATHS.some(p => pathname.startsWith(p))) return null;
  return (
    <nav className={styles.nav} aria-label="CRM sections">
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
