'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './NewsletterRunStatus.module.css';

// In-progress newsletter run indicator on the /content page. Signal is the
// primary review surface — this is a secondary, glanceable status. Subscribes
// to newsletter_runs via Realtime and shows the most recent active run.

const ACTIVE_STATUSES = ['running', 'suspended_gate1', 'suspended_gate2', 'suspended_hold'];

const STATUS_LABEL: Record<string, string> = {
  running: 'Newsletter starting…',
  suspended_gate1: 'Story selection sent for review',
  suspended_gate2: 'Draft ready for review',
  suspended_hold: 'Newsletter on hold',
};

interface NewsletterRun {
  workflow_run_id: string;
  status: string;
  time_range: string;
  started_at: string;
}

export function NewsletterRunStatus() {
  const [run, setRun] = useState<NewsletterRun | null>(null);

  const refresh = useCallback(async () => {
    // newsletter_runs isn't in the web Database types yet — cast at the boundary.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { data } = await supabase
      .from('newsletter_runs')
      .select('workflow_run_id, status, time_range, started_at')
      .in('status', ACTIVE_STATUSES)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setRun((data as NewsletterRun | null) ?? null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtimeSubscription(
    'newsletter_runs',
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  if (!run) return null;

  return (
    <div className={styles.banner} role="status">
      <StatusChip label="Newsletter" color="accent" />
      <span className={styles.label}>{STATUS_LABEL[run.status] ?? run.status}</span>
      <span className={styles.meta}>{run.time_range} edition</span>
    </div>
  );
}
