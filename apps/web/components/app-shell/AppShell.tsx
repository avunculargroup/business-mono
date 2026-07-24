'use client';

import { useRef } from 'react';
import { Sidebar } from './Sidebar';
import { PullToRefresh } from './PullToRefresh';
import styles from './AppShell.module.css';

interface AppShellProps {
  pendingCount: number;
  children: React.ReactNode;
}

export function AppShell({ pendingCount, children }: AppShellProps) {
  const mainRef = useRef<HTMLElement>(null);

  return (
    <div className={styles.shell}>
      <Sidebar pendingCount={pendingCount} />
      <main ref={mainRef} className={styles.main}>
        <PullToRefresh scrollRef={mainRef} />
        {children}
      </main>
    </div>
  );
}
