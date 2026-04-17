'use client';

import { useState, useEffect } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { Button } from '@/components/ui/Button';
import { getInterview } from '@/app/actions/interviews';
import { formatRelativeDate } from '@/lib/utils';
import {
  STAKEHOLDER_ROLE_LABELS,
  TRIGGER_EVENT_LABELS,
  INTERVIEW_STATUS_LABELS,
  INTERVIEW_CHANNEL_LABELS,
  type StakeholderRole,
  type TriggerEventType,
  type InterviewStatus,
  type DiscoveryInterviewChannel,
  type PainPointLog,
} from '@platform/shared';
import { Pencil } from 'lucide-react';
import type { InterviewRow } from './InterviewsList';
import styles from './InterviewDetail.module.css';

const STATUS_COLORS: Record<string, 'warning' | 'success' | 'neutral' | 'destructive'> = {
  scheduled: 'warning',
  completed: 'success',
  cancelled: 'neutral',
  no_show:   'destructive',
};

interface InterviewDetailProps {
  interview: InterviewRow;
  onEdit: () => void;
}

export function InterviewDetail({ interview, onEdit }: InterviewDetailProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');
  const [auditLog, setAuditLog] = useState<PainPointLog[] | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    if (activeTab === 'audit' && auditLog === null) {
      setLoadingAudit(true);
      getInterview(interview.id)
        .then((data) => {
          const log = (data as { pain_point_log?: PainPointLog[] }).pain_point_log ?? [];
          setAuditLog(log);
        })
        .catch(() => setAuditLog([]))
        .finally(() => setLoadingAudit(false));
    }
  }, [activeTab, auditLog, interview.id]);

  const contactName = interview.contacts
    ? `${interview.contacts.first_name} ${interview.contacts.last_name}`
    : null;
  const role = interview.contacts?.role as StakeholderRole | null;

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'details' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === 'audit' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('audit')}
        >
          Audit log
        </button>
      </div>

      {activeTab === 'details' && (
        <div className={styles.details}>
          <div className={styles.metaGrid}>
            <span className={styles.metaLabel}>Contact</span>
            <span className={styles.metaValue}>{contactName || '—'}</span>

            <span className={styles.metaLabel}>Company</span>
            <span className={styles.metaValue}>{interview.companies?.name || '—'}</span>

            <span className={styles.metaLabel}>Role</span>
            <span className={styles.metaValue}>
              {role
                ? <StatusChip label={STAKEHOLDER_ROLE_LABELS[role] ?? role} color="neutral" />
                : '—'}
            </span>

            <span className={styles.metaLabel}>Date</span>
            <span className={styles.metaValue}>
              {interview.interview_date
                ? <span className={styles.mono}>{formatRelativeDate(interview.interview_date)}</span>
                : '—'}
            </span>

            <span className={styles.metaLabel}>Status</span>
            <span className={styles.metaValue}>
              <StatusChip
                label={INTERVIEW_STATUS_LABELS[interview.status as InterviewStatus] ?? interview.status}
                color={STATUS_COLORS[interview.status] ?? 'neutral'}
              />
            </span>

            <span className={styles.metaLabel}>Channel</span>
            <span className={styles.metaValue}>
              {interview.channel
                ? INTERVIEW_CHANNEL_LABELS[interview.channel as DiscoveryInterviewChannel] ?? interview.channel
                : '—'}
            </span>

            <span className={styles.metaLabel}>Why now</span>
            <span className={styles.metaValue}>
              {interview.trigger_event
                ? TRIGGER_EVENT_LABELS[interview.trigger_event as TriggerEventType] ?? interview.trigger_event
                : '—'}
            </span>

            {interview.email_thread_id && (
              <>
                <span className={styles.metaLabel}>Thread ID</span>
                <span className={`${styles.metaValue} ${styles.mono}`}>{interview.email_thread_id}</span>
              </>
            )}
          </div>

          {(interview.pain_points?.length ?? 0) > 0 && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Pain points</h4>
              <div className={styles.chipList}>
                {interview.pain_points.map((pp) => (
                  <span key={pp} className={styles.chip}>{pp}</span>
                ))}
              </div>
            </div>
          )}

          {interview.notes && (
            <div className={styles.section}>
              <h4 className={styles.sectionTitle}>Notes</h4>
              <p className={styles.notes}>{interview.notes}</p>
            </div>
          )}

          <div className={styles.actions}>
            <Button variant="secondary" size="sm" onClick={onEdit}>
              <Pencil size={14} strokeWidth={1.5} />
              Edit interview
            </Button>
          </div>
        </div>
      )}

      {activeTab === 'audit' && (
        <div className={styles.audit}>
          {loadingAudit ? (
            <p className={styles.auditEmpty}>Loading…</p>
          ) : !auditLog || auditLog.length === 0 ? (
            <p className={styles.auditEmpty}>No pain point history yet. Pain points are logged when an interview is created or updated.</p>
          ) : (
            <table className={styles.auditTable}>
              <thead>
                <tr>
                  <th className={styles.auditTh}>Pain point</th>
                  <th className={styles.auditTh}>Change</th>
                  <th className={styles.auditTh}>When</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((entry) => (
                  <tr key={entry.id} className={styles.auditTr}>
                    <td className={styles.auditTd}>{entry.pain_point}</td>
                    <td className={styles.auditTd}>
                      <StatusChip
                        label={entry.change_type}
                        color={entry.change_type === 'insert' ? 'success' : 'warning'}
                      />
                    </td>
                    <td className={`${styles.auditTd} ${styles.mono}`}>
                      {new Date(entry.changed_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
