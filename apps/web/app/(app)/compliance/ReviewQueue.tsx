'use client';

import { useState, useTransition } from 'react';
import { ShieldCheck, CalendarClock, PencilLine } from 'lucide-react';
import { recordLexReview } from '@/app/actions/complianceReviews';
import { createTemplateVersion, updateTemplateBody } from '@/app/actions/complianceEditing';
import { BodyEditor } from './BodyEditor';
import {
  daysUntilReview,
  reviewUrgency,
  type ReviewableKind,
  type ReviewableRow,
} from '@/lib/compliance/queue';
import styles from './compliance.module.css';

export interface QueueItem extends ReviewableRow {
  kind: ReviewableKind;
  /** A short line under the title: artefact type, client type, version. */
  detail: string;
  /** The stored template source. Templates only; library entries are not edited here. */
  body?: string;
  version?: string;
}

interface Props {
  awaiting: QueueItem[];
  live: QueueItem[];
}

/** A year out. A default, not a rule — the field is editable and required. */
function defaultDueDate(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

export function ReviewQueue({ awaiting, live }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Awaiting review</h2>

        {awaiting.length === 0 ? (
          <p className={styles.empty}>
            Nothing is waiting. New templates and library entries land here as drafts.
          </p>
        ) : (
          <ul className={styles.list}>
            {awaiting.map((item) => (
              <li key={`${item.kind}-${item.id}`} className={styles.card}>
                <div className={styles.cardHead}>
                  <div>
                    <h3 className={styles.cardTitle}>{item.title}</h3>
                    <p className={styles.cardDetail}>
                      <code className={styles.slug}>{item.slug}</code> · {item.detail}
                    </p>
                  </div>
                  <span className={styles.statusBadge}>{item.status.replace(/_/g, ' ')}</span>
                </div>

                {openId === `${item.kind}-${item.id}` ? (
                  <ReviewForm item={item} onCancel={() => setOpenId(null)} />
                ) : (
                  <div className={styles.formActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => setOpenId(`${item.kind}-${item.id}`)}
                    >
                      <ShieldCheck size={16} strokeWidth={1.5} />
                      Record review
                    </button>

                    {/* Templates only. A library entry's body is prose with no
                        parser behind it, and editing it here would be an editor
                        with no validation — a different thing, worth building
                        deliberately rather than by extension. */}
                    {item.kind === 'template' && item.body !== undefined && (
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() =>
                          setEditingId(editingId === item.id ? null : item.id)
                        }
                      >
                        <PencilLine size={16} strokeWidth={1.5} />
                        {editingId === item.id ? 'Close' : 'Edit body'}
                      </button>
                    )}
                  </div>
                )}

                {editingId === item.id && item.body !== undefined && (
                  <BodyEditor
                    body={item.body}
                    status={item.status}
                    version={item.version ?? ''}
                    onSave={(body) => updateTemplateBody(item.id, body)}
                    onNewVersion={(version) => createTemplateVersion(item.id, version)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Live, and due to be read again</h2>

        {live.length === 0 ? (
          <p className={styles.empty}>Nothing is live yet.</p>
        ) : (
          <ul className={styles.list}>
            {live.map((item) => {
              const days = daysUntilReview(item.reviewDueDate);
              const urgency = reviewUrgency(days);

              return (
                <li key={`${item.kind}-${item.id}`} className={styles.card}>
                  <div className={styles.cardHead}>
                    <div>
                      <h3 className={styles.cardTitle}>{item.title}</h3>
                      <p className={styles.cardDetail}>
                        <code className={styles.slug}>{item.slug}</code> · {item.detail}
                      </p>
                    </div>
                    <span className={`${styles.due} ${styles[urgency]}`}>
                      <CalendarClock size={16} strokeWidth={1.5} />
                      {dueLabel(days, urgency)}
                    </span>
                  </div>

                  {item.kind === 'template' && item.body !== undefined && (
                    <>
                      <button
                        type="button"
                        className={styles.ghostButton}
                        onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                      >
                        <PencilLine size={16} strokeWidth={1.5} />
                        {editingId === item.id ? 'Close' : 'New version'}
                      </button>

                      {editingId === item.id && (
                        <BodyEditor
                          body={item.body}
                          status={item.status}
                          version={item.version ?? ''}
                          onSave={(body) => updateTemplateBody(item.id, body)}
                          onNewVersion={(version) => createTemplateVersion(item.id, version)}
                        />
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}

function dueLabel(days: number | null, urgency: ReturnType<typeof reviewUrgency>): string {
  if (urgency === 'unscheduled') return 'No review date set';
  if (days === null) return 'No review date set';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  return `Due in ${days} days`;
}

function ReviewForm({ item, onCancel }: { item: QueueItem; onCancel: () => void }) {
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await recordLexReview({
        kind: item.kind,
        id: item.id,
        notes,
        reviewDueDate: dueDate,
      });

      if (result.error) setError(result.error);
      else onCancel();
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.label} htmlFor={`notes-${item.id}`}>
        What did you review, and what did you conclude?
      </label>
      <textarea
        id={`notes-${item.id}`}
        className={styles.textarea}
        rows={3}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="Read in full against the current position. No changes needed."
      />

      <label className={styles.label} htmlFor={`due-${item.id}`}>
        Read again by
      </label>
      <input
        id={`due-${item.id}`}
        type="date"
        className={styles.input}
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />
      <p className={styles.hint}>
        Set this per artefact. Anything referencing the digital asset platform transition will move
        repeatedly over the next eighteen months; the SIS-derived templates will not.
      </p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={styles.primaryButton} disabled={pending}>
          {pending ? 'Publishing…' : 'Record review and publish'}
        </button>
        <button type="button" className={styles.ghostButton} onClick={onCancel} disabled={pending}>
          Cancel
        </button>
      </div>
    </form>
  );
}
