'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestSignInLink } from '@/app/actions/auth';
import styles from './login.module.css';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'Sending' : 'Send a sign-in link'}
    </button>
  );
}

export function LoginForm() {
  const [state, action] = useActionState(requestSignInLink, null);

  return (
    <form action={action}>
      <label className={styles.field}>
        <span className={styles.label}>Email address</span>
        <input
          className={styles.input}
          type="email"
          name="email"
          autoComplete="email"
          required
        />
      </label>
      <Submit />
      {state?.message ? (
        <p className={styles.message} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
