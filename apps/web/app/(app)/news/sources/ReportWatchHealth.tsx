'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/providers/ToastProvider';
import { formatRelativeDate } from '@/lib/utils';
import { clearDetectionAlert } from '@/app/actions/reportWatch';
import type { ReportWatchHealthRow } from '@platform/shared';
import styles from './sources.module.css';

/**
 * The silent-failure surface.
 *
 * A scraper that returns nothing looks exactly like a publisher that has not
 * published, and the difference is invisible until someone goes looking. This
 * table is the looking. It is sorted worst-first because it is only ever read
 * when something is wrong.
 */

/** Warning above 3, destructive above 7 — the spec's thresholds. */
const WARN_AT = 3;
const ALARM_AT = 7;

function emptyRunClass(count: number): string {
  if (count > ALARM_AT) return styles.emptyRunsAlarm;
  if (count > WARN_AT) return styles.emptyRunsWarn;
  return '';
}

const STRATEGY_LABELS: Record<string, string> = {
  rss: 'feed',
  sitemap: 'sitemap',
  index_page: 'index page',
};

interface Props {
  rows: ReportWatchHealthRow[];
}

export function ReportWatchHealth({ rows }: Props) {
  const [clearing, setClearing] = useState<string | null>(null);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const { success, error } = useToast();

  if (rows.length === 0) return null;

  const handleClear = async (sourceId: string) => {
    setClearing(sourceId);
    const result = await clearDetectionAlert(sourceId);
    setClearing(null);
    if (result.error) return error(result.error);
    setCleared((prev) => new Set(prev).add(sourceId));
    success('Alert cleared');
  };

  const needsAttention = rows.filter((r) => !cleared.has(r.source_id) && r.detection_consecutive_empty > WARN_AT);

  return (
    <section className={styles.healthPanel} aria-labelledby="report-watch-health">
      <div className={styles.healthHeader}>
        <h2 id="report-watch-health" className={styles.healthTitle}>
          Report watch health
        </h2>
        <p className={styles.healthIntro}>
          {needsAttention.length > 0
            ? `${needsAttention.length} source${needsAttention.length === 1 ? '' : 's'} has stopped returning candidates. That usually means the page structure changed, not that the publisher went quiet.`
            : 'Every watched publisher is still returning candidates.'}
        </p>
      </div>

      <div className={styles.healthTableWrap}>
        <table className={styles.healthTable}>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Strategies</th>
              <th scope="col">Empty runs</th>
              <th scope="col">Last candidate</th>
              <th scope="col">Acquired (30d)</th>
              <th scope="col">Latest report</th>
              <th scope="col">
                <span className={styles.srOnly}>Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const empties = cleared.has(row.source_id) ? 0 : row.detection_consecutive_empty;
              return (
                <tr key={row.source_id} className={row.is_active ? '' : styles.healthRowInactive}>
                  <th scope="row" className={styles.healthName}>
                    {row.name}
                    {!row.is_active && <span className={styles.muted}> — paused</span>}
                  </th>
                  <td className={styles.muted}>
                    {(row.detection_strategies ?? [])
                      .map((s) => STRATEGY_LABELS[s] ?? s)
                      .join(' → ') || '—'}
                  </td>
                  <td>
                    <span className={`${styles.mono} ${emptyRunClass(empties)}`}>{empties}</span>
                  </td>
                  <td className={styles.muted}>
                    {row.detection_last_success_at
                      ? formatRelativeDate(row.detection_last_success_at)
                      : 'Never'}
                  </td>
                  <td className={styles.mono}>{row.acquired_30d}</td>
                  <td className={styles.muted}>
                    {row.latest_report_published_at
                      ? formatRelativeDate(row.latest_report_published_at)
                      : '—'}
                  </td>
                  <td className={styles.healthActions}>
                    {empties > WARN_AT && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => handleClear(row.source_id)}
                        loading={clearing === row.source_id}
                      >
                        Clear alert
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
