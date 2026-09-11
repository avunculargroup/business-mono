import type { Metadata } from 'next';
import { Lockup } from '@/components/Lockup';
import { LoginForm } from './LoginForm';
import styles from './login.module.css';

export const metadata: Metadata = { title: 'Sign in' };

/**
 * Sign in. There is no sign-up form, here or anywhere.
 *
 * Access is invite-only: a founder provisions an account and the subscriber
 * receives an invitation. The page says so plainly rather than leaving someone
 * hunting for a "create account" link that does not exist.
 */
export default function LoginPage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <Lockup variant="stacked" />
        </header>

        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.lede}>
          Enter the address your invitation was sent to and we will email you a link. There is
          no password to remember.
        </p>

        <LoginForm />

        <p className={styles.note}>
          Minute is available by invitation. If you do not have an account and would like one,
          contact Bitcoin Treasury Solutions directly.
        </p>
      </div>
    </div>
  );
}
