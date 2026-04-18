'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
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
  MoreHorizontal,
  Search,
  ChevronRight,
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
    { href: '/crm/contacts',   label: 'Contacts'   },
    { href: '/crm/companies',  label: 'Companies'  },
    { href: '/crm/champions',  label: 'Champions'  },
    { href: '/crm/community',  label: 'Community'  },
  ]},
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/projects', label: 'Projects', icon: FolderOpen },
  { href: '/content', label: 'Content', icon: FileText },
  { href: '/discovery', label: 'Discovery', icon: Search, children: [
    { href: '/crm/interviews', label: 'Interviews'  },
    { href: '/crm/segments',   label: 'Segments'    },
    { href: '/discovery/lexicon',   label: 'Lexicon'   },
    { href: '/discovery/templates', label: 'Templates' },
    { href: '/discovery/feedback',  label: 'Feedback'  },
    { href: '/discovery/pipeline',  label: 'Pipeline'  },
  ]},
];

const systemNav = [
  { href: '/activity', label: 'Agent Activity', icon: Activity },
  { href: '/brand', label: 'Brand Hub', icon: Bookmark },
];

interface MoreNavChild {
  href: string;
  label: string;
}

interface MoreNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
  children?: MoreNavChild[];
}

interface MoreNavSection {
  label: string;
  items: MoreNavItem[];
}

const moreNav: MoreNavSection[] = [
  {
    label: 'Work',
    items: [
      { href: '/crm', label: 'CRM', icon: Users, children: [
        { href: '/crm/contacts',   label: 'Contacts'   },
        { href: '/crm/companies',  label: 'Companies'  },
        { href: '/crm/champions',  label: 'Champions'  },
        { href: '/crm/community',  label: 'Community'  },
      ]},
      { href: '/tasks',     label: 'Tasks',     icon: CheckSquare },
      { href: '/projects',  label: 'Projects',  icon: FolderOpen  },
      { href: '/content',   label: 'Content',   icon: FileText    },
      { href: '/discovery', label: 'Discovery', icon: Search, children: [
        { href: '/crm/interviews',        label: 'Interviews' },
        { href: '/crm/segments',          label: 'Segments'   },
        { href: '/discovery/lexicon',     label: 'Lexicon'    },
        { href: '/discovery/templates',   label: 'Templates'  },
        { href: '/discovery/feedback',    label: 'Feedback'   },
        { href: '/discovery/pipeline',    label: 'Pipeline'   },
      ]},
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/activity', label: 'Agent Activity', icon: Activity },
      { href: '/brand',    label: 'Brand Hub',      icon: Bookmark },
      { href: '/settings', label: 'Settings',       icon: Settings },
    ],
  },
];

export function Sidebar({ pendingCount }: SidebarProps) {
  const pathname = usePathname();
  const user = useCurrentUser();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    if (href === '/discovery') return pathname.startsWith('/discovery') || pathname.startsWith('/crm/interviews') || pathname.startsWith('/crm/segments');
    return pathname.startsWith(href);
  };

  const isMoreActive = pathname !== '/' && !pathname.startsWith('/simon');

  const toggleSection = (href: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(href)) {
        next.delete(href);
      } else {
        next.add(href);
      }
      return next;
    });
  };

  // Auto-expand the active section when the sheet opens
  useEffect(() => {
    if (!isMoreOpen) return;
    const active = moreNav
      .flatMap(s => s.items)
      .find(item => item.children && isActive(item.href));
    if (active) {
      setExpandedSections(new Set([active.href]));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMoreOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMoreOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

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
        <button
          type="button"
          className={`${styles.tab} ${styles.moreTab} ${isMoreActive && !isMoreOpen ? styles.tabActive : ''} ${isMoreOpen ? styles.tabActive : ''}`}
          onClick={() => setIsMoreOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={isMoreOpen}
        >
          <MoreHorizontal size={20} strokeWidth={1.5} />
          <span>More</span>
        </button>
      </nav>

      {/* More — bottom sheet backdrop */}
      <div
        className={`${styles.moreBackdrop} ${isMoreOpen ? styles.open : ''}`}
        onClick={() => setIsMoreOpen(false)}
        aria-hidden="true"
      />

      {/* More — bottom sheet */}
      <div
        className={`${styles.moreSheet} ${isMoreOpen ? styles.open : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="More navigation"
      >
        <div className={styles.moreSheetHandle} />
        {moreNav.map((section) => (
          <div key={section.label} className={styles.moreSheetSection}>
            <span className={styles.moreSheetSectionLabel}>{section.label}</span>
            {section.items.map((item) => {
              const active = isActive(item.href);
              const expanded = expandedSections.has(item.href);

              if (item.children) {
                return (
                  <div key={item.href}>
                    <button
                      type="button"
                      className={`${styles.moreSheetAccordionTrigger} ${active ? styles.moreSheetAccordionTriggerActive : ''}`}
                      onClick={() => toggleSection(item.href)}
                      aria-expanded={expanded}
                    >
                      <item.icon size={18} strokeWidth={1.5} />
                      <span>{item.label}</span>
                      <ChevronRight
                        size={16}
                        strokeWidth={1.5}
                        className={`${styles.moreSheetChevron} ${expanded ? styles.moreSheetChevronOpen : ''}`}
                      />
                    </button>
                    <div className={`${styles.moreSheetSubItems} ${expanded ? styles.moreSheetSubItemsOpen : ''}`}>
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={`${styles.moreSheetSubItem} ${pathname.startsWith(child.href) ? styles.moreSheetSubItemActive : ''}`}
                          onClick={() => setIsMoreOpen(false)}
                        >
                          {child.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.moreSheetItem} ${active ? styles.moreSheetItemActive : ''}`}
                  onClick={() => setIsMoreOpen(false)}
                >
                  <item.icon size={18} strokeWidth={1.5} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
