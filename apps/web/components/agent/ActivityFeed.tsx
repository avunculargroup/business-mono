'use client';

import { useState, useCallback } from 'react';
import { AgentActivityCard } from './AgentActivityCard';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import type { Database } from '@/lib/database';
import styles from './ActivityFeed.module.css';

type AgentActivity = Database['public']['Tables']['agent_activity']['Row'];

interface ActivityFeedProps {
  initialActivities: AgentActivity[];
  totalCount: number;
}

export function ActivityFeed({ initialActivities }: ActivityFeedProps) {
  const [activities, setActivities] = useState(initialActivities);

  // Real-time subscription for new items
  useRealtimeSubscription(
    'agent_activity',
    useCallback((payload) => {
      if (payload.eventType === 'INSERT') {
        const newActivity = payload.new as AgentActivity;
        setActivities((prev) => [newActivity, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        const updated = payload.new as AgentActivity;
        setActivities((prev) =>
          prev.map((a) => (a.id === updated.id ? updated : a))
        );
      }
    }, [])
  );

  const pending = activities.filter((a) => a.status === 'pending');
  const resolved = activities.filter((a) => a.status !== 'pending');

  return (
    <div className={styles.feed} role="feed" aria-label="Agent activity feed">
      {pending.length > 0 && (
        <section>
          <h2 className={styles.sectionTitle}>Awaiting approval</h2>
          <div className={styles.list}>
            {pending.map((activity) => (
              <AgentActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>
      )}

      <section>
        {pending.length > 0 && <h2 className={styles.sectionTitle}>History</h2>}
        <div className={styles.list}>
          {resolved.map((activity) => (
            <AgentActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      </section>

      {activities.length === 0 && (
        <div className={styles.empty}>
          <p>No agent activity yet. Activity appears here once agents start running.</p>
        </div>
      )}
    </div>
  );
}
