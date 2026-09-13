'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { acceptInvite } from '@/app/actions/invite';
import styles from '../../login/login.module.css';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={styles.submit} disabled={pending}>
      {pending ? 'Sending' : 'Accept and sign in'}
    </button>
  );
}

export function InviteForm({ token }: { token: string }) {
  const [state, action] = useActionState(acceptInvite, null);

  return (
    <form action={action}>
      <input type="hidden" name="token" value={token} />
      <Submit />
      {state?.message ? (
        <p className={styles.message} role="status">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
