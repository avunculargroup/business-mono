'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import type { ThreadItem } from '@/app/(app)/simon/page';
import type { Database } from '@/lib/database';
import { DirectorMessage } from './DirectorMessage';
import { SimonResponse } from './SimonResponse';
import { ApprovalCard } from './ApprovalCard';
import { ComposeArea } from './ComposeArea';
import { EmptyState } from '@/components/ui/EmptyState';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Bot } from 'lucide-react';
import styles from './SimonThread.module.css';

interface SimonThreadProps {
  initialItems: ThreadItem[];
}

export function SimonThread({ initialItems }: SimonThreadProps) {
  const [items, setItems] = useState(initialItems);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [hasNew, setHasNew] = useState(false);

  // Auto-scroll to bottom on mount
  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, []);

  // Track scroll position
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setIsAtBottom(atBottom);
    if (atBottom) setHasNew(false);
  }, []);

  // Auto-scroll when new items and at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else if (items.length > initialItems.length) {
      setHasNew(true);
    }
  }, [items.length, isAtBottom, initialItems.length]);

  // Real-time subscription for new agent activity
  useRealtimeSubscription(
    'agent_activity',
    useCallback((payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const activity = payload.new as Database['public']['Tables']['agent_activity']['Row'];
        if (activity && activity.agent_name === 'simon') {
          setItems((prev) => {
            const filtered = prev.filter(
              (item) => !(item.type === 'approval' && item.data.id === activity.id)
            );
            return [...filtered, { type: 'approval' as const, data: activity }];
          });
        }
      }
    }, []),
    'agent_name=eq.simon'
  );

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasNew(false);
  };

  if (items.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.thread}>
          <EmptyState
            icon={Bot}
            title="Start a conversation with Simon"
            description="Send a directive and Simon will coordinate the right agents to get it done."
          />
        </div>
        <ComposeArea />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.thread} ref={scrollRef} onScroll={handleScroll}>
        <div className={styles.messages}>
          {items.map((item, i) => {
            if (item.type === 'message') {
              if (item.data.role === 'director') {
                return <DirectorMessage key={i} message={item.data} />;
              }
              return <SimonResponse key={i} message={item.data} />;
            }
            return <ApprovalCard key={item.data.id} activity={item.data} />;
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {hasNew && (
        <button className={styles.newMessages} onClick={scrollToBottom}>
          New messages ↓
        </button>
      )}

      <ComposeArea />
    </div>
  );
}
