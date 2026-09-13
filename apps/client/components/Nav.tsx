'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lockup } from './Lockup';
import styles from './Nav.module.css';

/**
 * The eight routes, in the order the spec lists them.
 *
 * "The Brief" rather than "Home" and "Prepare" rather than "Documents":
 * vernacular from `references/naming.md`, and the nav is the first place a
 * subscriber learns it.
 */
const ROUTES = [
  { href: '/', label: 'The Brief' },
  { href: '/signals', label: 'Signals' },
  { href: '/indicators', label: 'Indicators' },
  { href: '/register', label: 'Register' },
  { href: '/directory', label: 'Directory' },
  { href: '/library', label: 'Library' },
  { href: '/prepare', label: 'Prepare' },
] as const;

export function Nav() {
  const pathname = usePathname();

  function isCurrent(href: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href);
  }

  return (
    <nav className={styles.nav} aria-label="Main">
      <Link href="/" aria-label="Minute, by Bitcoin Treasury Solutions">
        <Lockup variant="horizontal" />
      </Link>

      <ul className={styles.links}>
        {ROUTES.map((route) => (
          <li key={route.href}>
            <Link
              href={route.href}
              className={`${styles.link} ${isCurrent(route.href) ? styles.current : ''}`}
              aria-current={isCurrent(route.href) ? 'page' : undefined}
            >
              {route.label}
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/account"
        className={`${styles.link} ${styles.account} ${isCurrent('/account') ? styles.current : ''}`}
        aria-current={isCurrent('/account') ? 'page' : undefined}
      >
        Account
      </Link>
    </nav>
  );
}
