'use client';

import { useState, useTransition } from 'react';
import type { TemplateProblem } from '@platform/shared';
import { frozenReason, suggestNextVersion } from '@/lib/compliance/editing';
import styles from './compliance.module.css';

interface SaveResult {
  error?: string;
  problems?: TemplateProblem[];
  success?: boolean;
  reviewCleared?: boolean;
}

/**
 * Editing a body, or cutting a new version when it is too late to edit.
 *
 * One component for both tables, because the rule is the same in both and
 * writing it twice would be two chances to get the frozen case wrong.
 *
 * A frozen row still shows the control area — with the reason, and the
 * new-version form. Hiding it would leave someone hunting for an edit button
 * that is absent on purpose, which reads as a missing feature rather than as a
 * rule.
 */
export function BodyEditor({
  body,
  status,
  version,
  onSave,
  onNewVersion,
}: {
  body: string;
  status: string;
  version: string;
  onSave: (body: string) => Promise<SaveResult>;
  onNewVersion: (version: string) => Promise<SaveResult>;
}) {
  const frozen = frozenReason(status);

  return frozen ? (
    <NewVersionForm frozen={frozen} version={version} onNewVersion={onNewVersion} />
  ) : (
    <EditForm body={body} onSave={onSave} />
  );
}

function EditForm({
  body,
  onSave,
}: {
  body: string;
  onSave: (body: string) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState(body);
  const [error, setError] = useState<string | null>(null);
  const [problems, setProblems] = useState<TemplateProblem[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = draft !== body;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setProblems([]);
    setSaved(null);

    startTransition(async () => {
      const result = await onSave(draft);

      if (result.error) {
        setError(result.error);
        setProblems(result.problems ?? []);
        return;
      }

      setSaved(
        result.reviewCleared
          ? 'Saved. The Lex review was cleared, because it described the previous text — this needs reviewing again before it can go live.'
          : 'Saved.',
      );
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor="body">
        Body
      </label>
      <textarea
        id="body"
        className={styles.bodyTextarea}
        value={draft}
        spellCheck={false}
        onChange={(event) => setDraft(event.target.value)}
      />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {problems.length > 0 && (
        <ul className={styles.problems}>
          {problems.map((problem, index) => (
            <li key={`${problem.where}-${index}`}>
              <code className={styles.slug}>{problem.where}</code> {problem.message}
            </li>
          ))}
        </ul>
      )}

      {saved && (
        <p className={styles.saved} role="status">
          {saved}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending || !dirty}>
          {pending ? 'Saving…' : 'Save body'}
        </button>
        {dirty && (
          <button
            type="button"
            className={styles.ghostButton}
            onClick={() => {
              setDraft(body);
              setError(null);
              setProblems([]);
            }}
            disabled={pending}
          >
            Discard changes
          </button>
        )}
      </div>
    </form>
  );
}

function NewVersionForm({
  frozen,
  version,
  onNewVersion,
}: {
  frozen: string;
  version: string;
  onNewVersion: (version: string) => Promise<SaveResult>;
}) {
  const [next, setNext] = useState(() => suggestNextVersion(version) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await onNewVersion(next);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className={styles.form}>
      <p className={styles.frozenNote}>{frozen}</p>

      {/* A retired version gets the explanation and nothing else: there is no
          reason to branch a new version off an archived document, and offering
          it would suggest there is. */}
      {frozen.includes('new version') && (
        <form className={styles.newVersionRow} onSubmit={submit}>
          <label className={styles.label} htmlFor={`next-${version}`}>
            New version
          </label>
          <input
            id={`next-${version}`}
            className={styles.input}
            value={next}
            onChange={(event) => setNext(event.target.value)}
            placeholder={suggestNextVersion(version) ?? '1.1'}
          />
          <button type="submit" className={styles.ghostButton} disabled={pending || next === ''}>
            {pending ? 'Copying…' : 'Copy to a new draft'}
          </button>
        </form>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
