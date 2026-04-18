'use client';

import { useState, useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { logChampionEvent } from '@/app/actions/champions';
import { useToast } from '@/providers/ToastProvider';
import { CHAMPION_EVENT_TYPE_LABELS, type ChampionEventType } from '@platform/shared';
import styles from './Champions.module.css';
import formStyles from '@/components/discovery/DiscoveryForm.module.css';

type EventRow = {
  id: string;
  champion_id: string;
  event_type: string;
  event_date: string;
  details: string | null;
  created_at: string;
};

const EVENT_COLORS: Record<string, 'destructive' | 'warning' | 'success' | 'neutral'> = {
  job_change: 'warning',
  promotion:  'success',
  departure:  'destructive',
  note:       'neutral',
};

interface ChampionEventLogProps {
  championId: string;
  initialEvents: EventRow[];
}

export function ChampionEventLog({ championId, initialEvents }: ChampionEventLogProps) {
  const [events, setEvents] = useState(initialEvents);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const { success, error } = useToast();

  const handleSubmit = async (_prev: { error: string } | null, formData: FormData) => {
    const result = await logChampionEvent(championId, formData);
    if (result.error) { error(result.error); return { error: result.error }; }
    success('Event logged');
    setShowForm(false);
    router.refresh();
    return null;
  };

  const [state, formAction, isPending] = useActionState(handleSubmit, null);
  useEffect(() => { setIsSubmitting(isPending); }, [isPending]);

  return (
    <div>
      {events.length === 0 ? (
        <p className={styles.noEvents}>No events logged yet.</p>
      ) : (
        <div className={styles.eventList}>
          {events.map((ev) => (
            <div key={ev.id} className={styles.eventItem}>
              <span className={styles.eventDate}>{ev.event_date}</span>
              <div className={styles.eventBody}>
                <StatusChip
                  label={CHAMPION_EVENT_TYPE_LABELS[ev.event_type as ChampionEventType] ?? ev.event_type}
                  color={EVENT_COLORS[ev.event_type] ?? 'neutral'}
                />
                {ev.details && <p className={styles.eventDetails}>{ev.details}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm ? (
        <div className={styles.eventFormSection}>
          <p className={styles.eventFormTitle}>Log event</p>
          <form action={formAction} className={formStyles.form}>
            <div className={formStyles.row}>
              <div className={formStyles.field}>
                <label className={formStyles.label}>Event type <span className={formStyles.required}>*</span></label>
                <select name="event_type" defaultValue="note" className={formStyles.select}>
                  <option value="job_change">Job change</option>
                  <option value="promotion">Promotion</option>
                  <option value="departure">Departure</option>
                  <option value="note">Note</option>
                </select>
              </div>
              <div className={formStyles.field}>
                <label className={formStyles.label}>Date <span className={formStyles.required}>*</span></label>
                <input
                  type="date"
                  name="event_date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className={formStyles.input}
                  required
                />
              </div>
            </div>
            <div className={formStyles.field}>
              <label className={formStyles.label}>Details</label>
              <textarea
                name="details"
                rows={3}
                className={formStyles.textarea}
                placeholder="New company, new title, context…"
              />
            </div>
            {state?.error && <p className={formStyles.error}>{state.error}</p>}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" variant="primary" size="sm" loading={isSubmitting}>Log event</Button>
            </div>
          </form>
        </div>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowForm(true)}
          style={{ marginTop: events.length > 0 ? 12 : 0 }}
        >
          Log event
        </Button>
      )}
    </div>
  );
}
