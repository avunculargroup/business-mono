'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/browser';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from '../../app/(app)/campaigns/campaigns.module.css';

// Client wrapper around the campaigns list so status chips update live —
// the campaigns table is already Realtime-enabled (see
// 20260624000000_enable_realtime_campaign_gates.sql), this just subscribes.

export interface OverviewRow {
  id: string;
  slug: string;
  name: string;
  objective: string | null;
  status: string;
  start_date: string | null;
  duration_weeks: number | null;
  end_date: string | null;
  days_remaining: number | null;
  total_variants: number;
  published_count: number;
  approved_count: number;
  pending_count: number;
  flagged_count: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  strategy_approved: 'Strategy approved',
  plan_approved: 'Plan approved',
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  archived: 'Archived',
};

const STATUS_COLOR: Record<string, 'neutral' | 'accent' | 'success' | 'warning'> = {
  draft: 'neutral',
  strategy_approved: 'accent',
  plan_approved: 'accent',
  active: 'success',
  paused: 'warning',
  completed: 'success',
  archived: 'neutral',
};

export function CampaignsList({ initialCampaigns }: { initialCampaigns: OverviewRow[] }) {
  const [campaigns, setCampaigns] = useState(initialCampaigns);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from('v_campaign_overview').select('*');
    setCampaigns((data as OverviewRow[] | null) ?? []);
  }, []);

  useRealtimeSubscription(
    'campaigns',
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  useEffect(() => {
    setCampaigns(initialCampaigns);
  }, [initialCampaigns]);

  if (campaigns.length === 0) {
    return (
      <div className={styles.empty}>
        <Megaphone size={48} strokeWidth={1} className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No campaigns yet</h3>
        <p className={styles.emptyDesc}>
          A campaign turns one objective into a sequence of beats, each adapted into
          on-voice posts across your accounts. Start by setting the objective and audience.
        </p>
        <Link href="/campaigns/new" className={styles.newButton}>
          <Plus size={16} strokeWidth={1.5} />
          New campaign
        </Link>
      </div>
    );
  }

  return (
    <ul className={styles.list}>
      {campaigns.map((c) => (
        <li key={c.id}>
          <Link href={`/campaigns/${c.slug}`} className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.cardName}>{c.name}</span>
              <StatusChip label={STATUS_LABEL[c.status] ?? c.status} color={STATUS_COLOR[c.status] ?? 'neutral'} />
            </div>
            {c.objective && <p className={styles.cardObjective}>{c.objective}</p>}
            <div className={styles.cardMeta}>
              <span>{c.total_variants} variants</span>
              <span>{c.published_count} published</span>
              <span>{c.approved_count} approved</span>
              {c.flagged_count > 0 && (
                <span className={styles.flagged}>{c.flagged_count} flagged</span>
              )}
              {c.days_remaining != null && c.days_remaining > 0 && (
                <span>{c.days_remaining} days left</span>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
