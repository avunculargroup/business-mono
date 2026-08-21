'use client';

import { useState, useCallback } from 'react';
import { AgentActivityCard } from './AgentActivityCard';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { toAgentActivityItem } from '@platform/data-supabase';
import type { AgentActivityItem } from '@platform/data';
import type { Database } from '@platform/db';
import styles from './ActivityFeed.module.css';

type AgentActivityRow = Database['public']['Tables']['agent_activity']['Row'];

interface ActivityFeedProps {
  initialActivities: AgentActivityItem[];
  totalCount: number;
}

export function ActivityFeed({ initialActivities }: ActivityFeedProps) {
  const [activities, setActivities] = useState(initialActivities);

  // Real-time subscription for new items. Realtime delivers raw table rows, not
  // read models, so payloads go through the adapter's mapper — the same one the
  // server read used — rather than a second hand-rolled conversion that could
  // drift from it. Realtime itself stays outside the seam: it has no fixture
  // equivalent, and the demo no-ops it.
  useRealtimeSubscription(
    'agent_activity',
    useCallback((payload) => {
      if (payload.eventType === 'INSERT') {
        const newActivity = toAgentActivityItem(payload.new as AgentActivityRow);
        setActivities((prev) => [newActivity, ...prev]);
      } else if (payload.eventType === 'UPDATE') {
        const updated = toAgentActivityItem(payload.new as AgentActivityRow);
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
