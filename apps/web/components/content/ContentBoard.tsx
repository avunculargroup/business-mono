'use client';

import { useState, useOptimistic, useTransition } from 'react';
import { StatusChip } from '@/components/ui/StatusChip';
import { updateContentStatus } from '@/app/actions/content';
import Link from 'next/link';
import styles from './ContentBoard.module.css';

type ContentItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduled_for: string | null;
  author_id: string | null;
};

const statusColumns = [
  { key: 'idea', label: 'Idea' },
  { key: 'draft', label: 'Draft' },
  { key: 'review', label: 'Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
];

const typeColors: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  linkedin: 'accent',
  twitter_x: 'warning',
  newsletter: 'success',
  blog: 'neutral',
  idea: 'neutral',
  email: 'neutral',
};

interface ContentBoardProps {
  items: ContentItem[];
  teamMembers: { id: string; name: string }[];
}

export function ContentBoard({ items }: ContentBoardProps) {
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [optimisticItems, setOptimisticStatus] = useOptimistic(
    items,
    (currentItems, { id, status }: { id: string; status: string }) =>
      currentItems.map((item) => (item.id === id ? { ...item, status } : item))
  );

  const handleDrop = (e: React.DragEvent, newStatus: string) => {
    e.preventDefault();
    const itemId = e.dataTransfer.getData('text/plain');
    if (!itemId) return;

    setError(null);
    startTransition(async () => {
      setOptimisticStatus({ id: itemId, status: newStatus });
      const result = await updateContentStatus(itemId, newStatus);
      if (result && 'error' in result && result.error) {
        setError(result.error);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragStart = (e: React.DragEvent, itemId: string) => {
    e.dataTransfer.setData('text/plain', itemId);
  };

  return (
    <div>
      {error && (
        <div className={styles.error} role="alert">
          Failed to update: {error}
          <button onClick={() => setError(null)} className={styles.dismissError}>Dismiss</button>
        </div>
      )}
      <div className={styles.board}>
        {statusColumns.map((col) => {
          const colItems = optimisticItems.filter((i) => i.status === col.key);
          return (
            <div
              key={col.key}
              className={styles.column}
              onDrop={(e) => handleDrop(e, col.key)}
              onDragOver={handleDragOver}
            >
              <div className={styles.columnHeader}>
                <span className={styles.columnLabel}>{col.label}</span>
                <span className={styles.columnCount}>{colItems.length}</span>
              </div>
              <div className={styles.cards}>
                {colItems.map((item) => (
                  <Link
                    key={item.id}
                    href={`/content/${item.id}`}
                    className={styles.card}
                    draggable
                    onDragStart={(e) => handleDragStart(e, item.id)}
                  >
                    <span className={styles.cardTitle}>{item.title || 'Untitled'}</span>
                    <div className={styles.cardMeta}>
                      <StatusChip label={item.type.replace('_', ' ')} color={typeColors[item.type] || 'neutral'} />
                      {item.author_id && (
                        <span className={styles.assignee}>Assigned</span>
                      )}
                    </div>
                  </Link>
                ))}
                {colItems.length === 0 && (
                  <p className={styles.emptyCol}>No items</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
