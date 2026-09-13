'use client';

import { useState, useTransition } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import styles from './ClientGate.module.css';

/**
 * The control that decides whether something reaches a paying subscriber.
 *
 * One component for the register and the directory, because they are the same
 * decision wearing different column names: a boolean, a named person and a
 * timestamp, with a CHECK constraint insisting on the last two. "This may be
 * shown to someone paying for it" is an act of authorship, and an act of
 * authorship has an author.
 *
 * Deliberately not a bare switch. A toggle that silently flips a row into a
 * subscriber's view is the wrong affordance for the highest-consequence action
 * in the internal app, so the state is stated in words, the consequence is
 * stated underneath, and the control says what it will do rather than what the
 * state currently is.
 */

export interface ClientGateProps {
  /** Whether it currently reaches subscribers. `null` means never assessed. */
  cleared: boolean | null;
  /** What being cleared means here, in one sentence. */
  consequence: string;
  /** What being withheld means. Absence is a state worth naming, not a blank. */
  withheldConsequence: string;
  /** Shown when `cleared` is null — assessed is a third state, not a false. */
  unassessedNote?: string;
  /** When set, a note is required before clearing and is sent with it. */
  requireNote?: { label: string; hint: string; initial?: string };
  onChange: (cleared: boolean, note: string) => Promise<{ error?: string; success?: boolean }>;
}

export function ClientGate({
  cleared,
  consequence,
  withheldConsequence,
  unassessedNote,
  requireNote,
  onChange,
}: ClientGateProps) {
  const [note, setNote] = useState(requireNote?.initial ?? '');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function apply(next: boolean) {
    setError(null);

    startTransition(async () => {
      const result = await onChange(next, note);
      if (result.error) setError(result.error);
      else setOpen(false);
    });
  }

  const state = cleared === null ? 'unassessed' : cleared ? 'cleared' : 'withheld';

  return (
    <section className={styles.gate} aria-label="Subscriber visibility">
      <div className={styles.head}>
        <span className={`${styles.state} ${styles[state]}`}>
          {cleared ? <Eye size={16} strokeWidth={1.5} /> : <EyeOff size={16} strokeWidth={1.5} />}
          {state === 'unassessed'
            ? 'Not assessed'
            : cleared
              ? 'Visible to subscribers'
              : 'Not visible to subscribers'}
        </span>
      </div>

      <p className={styles.consequence}>
        {state === 'unassessed' && unassessedNote
          ? unassessedNote
          : cleared
            ? consequence
            : withheldConsequence}
      </p>

      {open ? (
        <div className={styles.form}>
          {requireNote && (
            <>
              <label className={styles.label} htmlFor="gate-note">
                {requireNote.label}
              </label>
              <textarea
                id="gate-note"
                className={styles.textarea}
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <p className={styles.hint}>{requireNote.hint}</p>
            </>
          )}

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => apply(!cleared)}
              disabled={pending}
            >
              {pending ? 'Saving…' : cleared ? 'Withhold from subscribers' : 'Make visible to subscribers'}
            </button>
            <button
              type="button"
              className={styles.ghostButton}
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className={styles.ghostButton} onClick={() => setOpen(true)}>
          Change
        </button>
      )}
    </section>
  );
}
