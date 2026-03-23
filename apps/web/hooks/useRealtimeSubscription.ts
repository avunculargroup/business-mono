'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/browser';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

export function useRealtimeSubscription(
  table: string,
  callback: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void,
  filter?: string
) {
  useEffect(() => {
    const supabase = createClient();
    const channelName = `realtime-${table}-${filter || 'all'}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes' as never,
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter ? { filter } : {}),
        },
        callback as never
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, callback]);
}
