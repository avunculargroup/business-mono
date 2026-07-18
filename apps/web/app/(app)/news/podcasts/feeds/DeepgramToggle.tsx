'use client';

import { useState, useTransition } from 'react';
import { setDeepgramTranscription } from '@/app/actions/podcasts';
import styles from './feeds.module.css';

interface Props {
  sourceId: string;
  enabled: boolean;
}

// Interactive switch on each podcast feed card. Optimistically flips the label,
// calls the server action, and reverts if it fails.
export function DeepgramToggle({ sourceId, enabled }: Props) {
  const [on, setOn] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      const result = await setDeepgramTranscription(sourceId, next);
      if (result?.error) setOn(!next);
    });
  }

  return (
    <label className={styles.switchRow}>
      <input
        type="checkbox"
        role="switch"
        checked={on}
        disabled={pending}
        onChange={toggle}
      />
      <span className={styles.switchTrack} aria-hidden="true">
        <span className={styles.switchThumb} />
      </span>
      <span className={styles.deepgramLabel}>Deepgram {on ? 'on' : 'off'}</span>
    </label>
  );
}
