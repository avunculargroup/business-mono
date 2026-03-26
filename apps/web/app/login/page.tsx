'use client';

import { Suspense } from 'react';
import { useActionState } from 'react';
import { useSearchParams } from 'next/navigation';
import { login } from '@/app/actions/auth';
import { BtsLogo } from '@/components/app-shell/BtsLogo';
import styles from './login.module.css';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const [state, formAction, isPending] = useActionState(login, null);

  return (
    <div className={styles.card}>
      <h1 className={styles.cardTitle}>Internal Platform</h1>
      <form action={formAction}>
        <input type="hidden" name="redirect" value={redirectTo} />
        <div className={styles.field}>
          <label htmlFor="email" className={styles.label}>Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={styles.input}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor="password" className={styles.label}>Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className={styles.input}
          />
        </div>
        {state?.error && <div className={styles.error}>{state.error}</div>}
        <button type="submit" disabled={isPending} className={styles.submit}>
          {isPending ? 'Signing in\u2026' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className={styles.page}>
      <div>
        <div className={styles.logo}>
          <BtsLogo size={48} />
          <div className={styles.logoMark}>BTS</div>
          <div className={styles.logoCaption}>Bitcoin Treasury Solutions</div>
        </div>
        <Suspense fallback={<div className={styles.card}><h1 className={styles.cardTitle}>Loading...</h1></div>}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
