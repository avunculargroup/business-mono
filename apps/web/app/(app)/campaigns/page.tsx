import Link from 'next/link';
import { Megaphone, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/app-shell/PageHeader';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './campaigns.module.css';

// Campaigns list — progress + timeline per campaign, from v_campaign_overview.
// The strategy layer's home; "New campaign" opens the creation wizard.

interface OverviewRow {
  id: string;
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

export default async function CampaignsPage() {
  const supabase = await createClient();
  // v_campaign_overview isn't in the generated web types until db:generate-types
  // runs post-migration — cast at the boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('v_campaign_overview')
    .select('*');
  const campaigns = (data ?? []) as OverviewRow[];

  return (
    <>
      <PageHeader title="Campaigns">
        <Link href="/campaigns/new" className={styles.newButton}>
          <Plus size={16} strokeWidth={1.5} />
          New campaign
        </Link>
      </PageHeader>

      {campaigns.length === 0 ? (
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
      ) : (
        <ul className={styles.list}>
          {campaigns.map((c) => (
            <li key={c.id}>
              <Link href={`/campaigns/${c.id}`} className={styles.card}>
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
      )}
    </>
  );
}
