import type { Metadata } from 'next';
import { Lockup } from '@/components/Lockup';
import styles from '../login/login.module.css';

export const metadata: Metadata = { title: 'No access' };

/**
 * A signed-in account that is not a subscriber.
 *
 * Two ways to arrive: a founder signed in here rather than at the internal app
 * — the disjointness triggers guarantee a person is staff or a subscriber and
 * never both — or a seat was disabled.
 *
 * Says which it might be, because a half-rendered app or a redirect loop tells
 * the reader nothing and generates a support call either way.
 */
export default function NoAccessPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <Lockup variant="stacked" />
        </header>

        <h1 className={styles.title}>This account cannot open Minute</h1>
        <p className={styles.lede}>
          You are signed in, but this address is not an active Minute seat. That usually means
          one of two things: the seat has been disabled, or this is a Bitcoin Treasury
          Solutions staff account, which uses the internal platform instead.
        </p>

        <p className={styles.note}>
          <a href="/logout">Sign out</a> and try the address your invitation was sent to, or
          contact Bitcoin Treasury Solutions.
        </p>
      </div>
    </div>
  );
}
