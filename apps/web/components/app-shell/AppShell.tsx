'use client';

import { Sidebar } from './Sidebar';
import styles from './AppShell.module.css';

interface AppShellProps {
  pendingCount: number;
  children: React.ReactNode;
}

export function AppShell({ pendingCount, children }: AppShellProps) {
  return (
    <div className={styles.shell}>
      <Sidebar pendingCount={pendingCount} />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
