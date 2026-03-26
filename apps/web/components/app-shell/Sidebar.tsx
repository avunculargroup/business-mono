'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Bot,
  Users,
  CheckSquare,
  FolderOpen,
  FileText,
  Activity,
  Bookmark,
  Settings,
  LogOut,
} from 'lucide-react';
import { useCurrentUser } from '@/providers/UserProvider';
import { logout } from '@/app/actions/auth';
import { getInitials } from '@/lib/utils';
import { BtsLogo } from './BtsLogo';
import styles from './Sidebar.module.css';

interface SidebarProps {
  pendingCount: number;
}

const workNav = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/simon', label: 'Simon', icon: Bot, badge: true },
  { href: '/crm', label: 'CRM', icon: Users, children: [
    { href: '/crm/contacts', label: 'Contacts' },
    { href: '/crm/companies', label: 'Companies' },
  ]},
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/content', label: 'Content', icon: FileText },
];

const systemNav = [
  { href: '/activity', label: 'Agent Activity', icon: Activity },
  { href: '/brand', label: 'Brand Hub', icon: Bookmark },
];

export function Sidebar({ pendingCount }: SidebarProps) {
  const pathname = usePathname();
  const user = useCurrentUser();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <BtsLogo size={28} />
          <div className={styles.logoText}>
            <span className={styles.logoMark}>BTS</span>
            <span className={styles.logoCaption}>Internal</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Work</span>
            {workNav.map((item) => (
              <div key={item.href}>
                <Link
                  href={item.children ? item.children[0].href : item.href}
                  className={`${styles.navItem} ${isActive(item.href) ? styles.active : ''}`}
                >
                  <item.icon size={18} strokeWidth={1.5} />
                  <span className={styles.navLabel}>{item.label}</span>
                  {item.badge && pendingCount > 0 && (
                    <span className={styles.badge}>{pendingCount}</span>
                  )}
                </Link>
                {item.children && isActive(item.href) && (
                  <div className={styles.subNav}>
                    {item.children.map((child) => (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={`${styles.subNavItem} ${pathname.startsWith(child.href) ? styles.active : ''}`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>System</span>
            {systemNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isActive(item.href) ? styles.active : ''}`}
              >
                <item.icon size={18} strokeWidth={1.5} />
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className={styles.footer}>
          <Link
            href="/settings"
            className={`${styles.navItem} ${isActive('/settings') ? styles.active : ''}`}
          >
            <Settings size={18} strokeWidth={1.5} />
            <span className={styles.navLabel}>Settings</span>
          </Link>
          <div className={styles.userRow}>
            <div className={styles.avatar}>{getInitials(user.full_name)}</div>
            <span className={styles.userName}>{user.full_name}</span>
            <form action={logout}>
              <button type="submit" className={styles.signOut} title="Sign out">
                <LogOut size={16} strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className={styles.bottomBar}>
        <Link href="/" className={`${styles.tab} ${pathname === '/' ? styles.tabActive : ''}`}>
          <LayoutDashboard size={20} strokeWidth={1.5} />
          <span>Home</span>
        </Link>
        <Link href="/simon" className={`${styles.tab} ${isActive('/simon') ? styles.tabActive : ''}`}>
          <Bot size={20} strokeWidth={1.5} />
          <span>Simon</span>
          {pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
        </Link>
        <Link href="/crm/contacts" className={`${styles.tab} ${isActive('/crm') ? styles.tabActive : ''}`}>
          <Users size={20} strokeWidth={1.5} />
          <span>CRM</span>
        </Link>
        <Link href="/tasks" className={`${styles.tab} ${isActive('/tasks') ? styles.tabActive : ''}`}>
          <CheckSquare size={20} strokeWidth={1.5} />
          <span>Tasks</span>
        </Link>
        <Link href="/content" className={`${styles.tab} ${isActive('/content') ? styles.tabActive : ''}`}>
          <FileText size={20} strokeWidth={1.5} />
          <span>Content</span>
        </Link>
      </nav>
    </>
  );
}
