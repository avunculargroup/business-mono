'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Building2,
  Landmark,
  FileText,
  LayoutDashboard,
  Newspaper,
  PenLine,
  Radar,
  BookOpen,
  Footprints,
} from 'lucide-react';
import styles from './Nav.module.css';

/**
 * The demo's routes, which are exactly the surfaces it has fixtures for.
 *
 * Deliberately shorter than the platform's own sidebar: a route here with
 * nothing behind it would be a dead link on a page whose whole job is to be
 * trustworthy. `/architecture` is demo-only — it is where the written notes the
 * annotations link to will live.
 */
const ROUTES = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/market-reports', label: 'Market reports', icon: FileText },
  { href: '/news', label: 'Research', icon: Newspaper },
  { href: '/activity', label: 'Agent activity', icon: Activity },
  // The centrepiece. Assume a reader clicks exactly one thing.
  { href: '/agents/run/variant-gate-web', label: 'Trace replay', icon: Footprints },
  { href: '/content', label: 'Content', icon: PenLine },
  { href: '/signals', label: 'Signals', icon: Radar },
  { href: '/crm/companies', label: 'Companies', icon: Building2 },
  { href: '/research', label: 'Corporate research', icon: Landmark },
  { href: '/architecture', label: 'Architecture', icon: BookOpen },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar} aria-label="Demo sections">
      <div className={styles.brand}>BTS</div>

      <div>
        <div className={styles.caption}>Surfaces</div>
        <ul className={styles.list}>
          {ROUTES.map(({ href, label, icon: Icon }) => {
            const active = href === '/' ? pathname === '/' : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={`${styles.item} ${active ? styles.itemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} strokeWidth={1.5} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
