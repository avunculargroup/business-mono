'use client';

import { AgentBadge } from '@/components/ui/AgentBadge';
import { ApprovalControls } from './ApprovalControls';
import type { Database } from '@/lib/database';
import { formatDateTime } from '@/lib/utils';
import styles from './AgentActivityCard.module.css';

type AgentActivity = Database['public']['Tables']['agent_activity']['Row'];

interface AgentActivityCardProps {
  activity: AgentActivity;
  compact?: boolean;
}

export function AgentActivityCard({ activity, compact }: AgentActivityCardProps) {
  const proposedActions = (activity.proposed_actions as Array<{ description: string; entity_type?: string; entity_id?: string }>) || [];

  const borderClass =
    activity.status === 'pending'
      ? styles.borderWarning
      : activity.status === 'approved'
        ? styles.borderSuccess
        : activity.status === 'rejected'
          ? styles.borderDestructive
          : '';

  return (
    <div className={`${styles.card} ${borderClass} ${compact ? styles.compact : ''}`}>
      <div className={styles.header}>
        <AgentBadge agentName={activity.agent_name} size={compact ? 'sm' : 'md'} />
        <span className={styles.timestamp}>{formatDateTime(activity.created_at)}</span>
      </div>

      <p className={styles.action}>{activity.action}</p>

      {activity.trigger_type && (
        <p className={styles.trigger}>Triggered by: {activity.trigger_type}</p>
      )}

      {proposedActions.length > 0 && !compact && (
        <ul className={styles.actionList}>
          {proposedActions.map((pa, i) => (
            <li key={i} className={styles.actionItem}>
              {pa.description}
              {pa.entity_type && (
                <span className={styles.entity}> ({pa.entity_type})</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {compact && proposedActions.length > 0 && (
        <p className={styles.actionCount}>
          {proposedActions.length} proposed action{proposedActions.length !== 1 ? 's' : ''}
        </p>
      )}

      {activity.status === 'pending' && !compact && (
        <ApprovalControls activityId={activity.id} />
      )}

      {activity.status !== 'pending' && (
        <div className={styles.statusBadge}>
          <span className={`${styles.statusDot} ${styles[activity.status]}`} />
          {activity.status === 'approved' ? 'Approved' : activity.status === 'rejected' ? 'Rejected' : 'Auto'}
        </div>
      )}
    </div>
  );
}
