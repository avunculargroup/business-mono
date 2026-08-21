import type { ReactNode } from 'react';
import { DemoChip } from './DemoChip';
import styles from './Page.module.css';

/**
 * A demo page's heading and body.
 *
 * Phase 5 renders these surfaces with local markup rather than the platform's
 * own components: those still live in `apps/web` and move to `@platform/ui` in
 * Phase 7, which is when the demo starts sharing them for real. What matters
 * now is that the data reaches the page through the seam — the markup is the
 * part that is meant to be replaced.
 */
export function Page({
  title,
  lede,
  children,
}: {
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <DemoChip />
      </div>
      {lede ? <p className={styles.lede}>{lede}</p> : null}
      {children}
    </>
  );
}
