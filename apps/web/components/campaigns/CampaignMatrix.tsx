'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Grid3x3, Flag } from 'lucide-react';
import { StatusChip } from '@/components/ui/StatusChip';
import styles from './CampaignMatrix.module.css';

// The campaign matrix — every variant with its beat, account, platform, status,
// and compliance state (v_campaign_matrix). Two layouts: a chronological agenda
// (the rhythm of the campaign, default on mobile) and a coverage grid (beats ×
// accounts — which cells are thin). Each variant links to its Gate 3 editor.

export interface MatrixRow {
  id: string;
  beat_id: string | null;
  beat_sequence: number | null;
  beat_title: string | null;
  account_id: string;
  account_name: string | null;
  platform: 'linkedin' | 'twitter_x';
  is_thread: boolean;
  status: string;
  scheduled_for: string | null;
  compliance_status: string | null;
  needs_disclaimer: boolean;
}

const STATUS_COLOR: Record<string, 'neutral' | 'accent' | 'success' | 'warning'> = {
  idea: 'neutral',
  draft: 'warning',
  review: 'warning',
  approved: 'accent',
  scheduled: 'accent',
  published: 'success',
  archived: 'neutral',
};

function formatWhen(scheduledFor: string | null): string {
  if (!scheduledFor) return 'Unscheduled';
  const [date, time] = scheduledFor.split('T');
  return time ? `${date} · ${time.slice(0, 5)}` : (date ?? scheduledFor);
}

function StatusCell({ row }: { row: MatrixRow }) {
  return (
    <Link href={`/campaigns/variants/${row.id}`} className={styles.cellLink}>
      <StatusChip label={row.status} color={STATUS_COLOR[row.status] ?? 'neutral'} />
      {row.compliance_status === 'flagged' && (
        <Flag size={12} strokeWidth={1.5} className={styles.flag} aria-label="Compliance flagged" />
      )}
    </Link>
  );
}

export function CampaignMatrix({ rows }: { rows: MatrixRow[] }) {
  const [view, setView] = useState<'agenda' | 'grid'>('agenda');

  const agenda = useMemo(
    () =>
      [...rows].sort((a, b) => {
        if (a.scheduled_for && b.scheduled_for) return a.scheduled_for.localeCompare(b.scheduled_for);
        if (a.scheduled_for) return -1;
        if (b.scheduled_for) return 1;
        return (a.beat_sequence ?? 0) - (b.beat_sequence ?? 0);
      }),
    [rows],
  );

  const { beats, accounts, cell } = useMemo(() => {
    const beatMap = new Map<number, string>();
    const acctMap = new Map<string, string>();
    const cellMap = new Map<string, MatrixRow>();
    for (const r of rows) {
      if (r.beat_sequence != null) beatMap.set(r.beat_sequence, r.beat_title ?? `Beat ${r.beat_sequence}`);
      acctMap.set(r.account_id, r.account_name ?? 'Account');
      if (r.beat_sequence != null) cellMap.set(`${r.beat_sequence}:${r.account_id}`, r);
    }
    return {
      beats: [...beatMap.entries()].sort((a, b) => a[0] - b[0]),
      accounts: [...acctMap.entries()],
      cell: cellMap,
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <section className={styles.wrap} aria-label="Campaign matrix">
      <div className={styles.head}>
        <h2 className={styles.title}>Variants</h2>
        <div className={styles.toggle} role="tablist" aria-label="Matrix layout">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'agenda'}
            className={`${styles.toggleBtn} ${view === 'agenda' ? styles.toggleOn : ''}`}
            onClick={() => setView('agenda')}
          >
            <CalendarDays size={16} strokeWidth={1.5} />
            Schedule
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'grid'}
            className={`${styles.toggleBtn} ${view === 'grid' ? styles.toggleOn : ''}`}
            onClick={() => setView('grid')}
          >
            <Grid3x3 size={16} strokeWidth={1.5} />
            Coverage
          </button>
        </div>
      </div>

      {view === 'agenda' ? (
        <ul className={styles.agenda}>
          {agenda.map((r) => (
            <li key={r.id} className={styles.agendaRow}>
              <span className={styles.when}>{formatWhen(r.scheduled_for)}</span>
              <span className={styles.beat}>
                Beat {r.beat_sequence}
                {r.beat_title ? ` — ${r.beat_title}` : ''}
              </span>
              <span className={styles.account}>
                {r.account_name}
                <span className={styles.platform}>{r.platform === 'twitter_x' ? 'X' : 'LinkedIn'}</span>
                {r.is_thread && <span className={styles.platform}>thread</span>}
              </span>
              <StatusCell row={r} />
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.gridScroll}>
          <table className={styles.grid}>
            <thead>
              <tr>
                <th className={styles.gridCorner}>Beat</th>
                {accounts.map(([id, name]) => (
                  <th key={id} className={styles.gridColHead}>
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {beats.map(([seq, title]) => (
                <tr key={seq}>
                  <th className={styles.gridRowHead} scope="row">
                    <span className={styles.gridSeq}>{seq}</span>
                    {title}
                  </th>
                  {accounts.map(([acctId]) => {
                    const r = cell.get(`${seq}:${acctId}`);
                    return (
                      <td key={acctId} className={styles.gridCell}>
                        {r ? <StatusCell row={r} /> : <span className={styles.gridGap}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
