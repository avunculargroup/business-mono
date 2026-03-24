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
import { sendDirective } from '@/app/actions/simon';
import { Bot } from 'lucide-react';
import styles from './SimonThread.module.css';

interface SimonThreadProps {
  initialItems: ThreadItem[];
}

type ConvRow = {
  signal_chat_id: string;
  messages: unknown;
};

function parseConversationMessages(messages: unknown): ThreadItem[] {
  if (!Array.isArray(messages)) return [];
  return (messages as Array<{ role: string; content: string; source?: string; timestamp?: string }>).map((m) => ({
    type: 'message' as const,
    data: {
      role: (m.role === 'user' ? 'director' : 'simon') as 'director' | 'simon',
      content: m.content,
      source: m.source,
      timestamp: m.timestamp ?? new Date().toISOString(),
    },
  }));
}

function sortItems(items: ThreadItem[]): ThreadItem[] {
  return [...items].sort((a, b) => {
    const aTime = a.type === 'message' ? a.data.timestamp : (a.data.created_at ?? '');
    const bTime = b.type === 'message' ? b.data.timestamp : (b.data.created_at ?? '');
    return new Date(aTime).getTime() - new Date(bTime).getTime();
  });
}

export function SimonThread({ initialItems }: SimonThreadProps) {
  const [messageItems, setMessageItems] = useState<ThreadItem[]>(() =>
    initialItems.filter((i) => i.type === 'message')
  );
  const [approvalItems, setApprovalItems] = useState<ThreadItem[]>(() =>
    initialItems.filter((i) => i.type === 'approval')
  );

  const items = sortItems([...messageItems, ...approvalItems]);

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

  // Auto-scroll when new items arrive and user is at bottom
  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    } else {
      setHasNew(true);
    }
  }, [items.length, isAtBottom]);

  // Real-time: agent_activity (approval cards)
  useRealtimeSubscription(
    'agent_activity',
    useCallback((payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const activity = payload.new as Database['public']['Tables']['agent_activity']['Row'];
        if (activity && activity.agent_name === 'simon') {
          setApprovalItems((prev) => {
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

  // Real-time: agent_conversations (Simon's responses)
  useRealtimeSubscription(
    'agent_conversations',
    useCallback((payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const conv = payload.new as ConvRow;
        if (conv?.signal_chat_id === 'web') {
          setMessageItems(parseConversationMessages(conv.messages));
        }
      }
    }, []),
    'signal_chat_id=eq.web'
  );

  // Send handler: optimistic update + server action
  const handleSend = useCallback(async (message: string) => {
    const optimistic: ThreadItem = {
      type: 'message',
      data: {
        role: 'director',
        content: message,
        timestamp: new Date().toISOString(),
      },
    };
    setMessageItems((prev) => [...prev, optimistic]);
    await sendDirective(message);
  }, []);

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
        <ComposeArea onSend={handleSend} />
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

      <ComposeArea onSend={handleSend} />
    </div>
  );
}
