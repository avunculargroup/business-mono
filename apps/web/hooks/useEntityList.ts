'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/providers/ToastProvider';
import { useOptimisticList } from '@/hooks/useOptimisticList';

/**
 * The wiring shared by every CRUD list page (~8 of them): the
 * create/edit/delete dialog-state triad, the async delete flow (confirm →
 * server action → toast → refresh), and an optimistic list for snappy
 * create/update. A list supplies its initial rows and its `remove` action and
 * renders the table + dialogs; the state plumbing lives here.
 *
 *   const list = useEntityList({ initialItems, entityLabel: 'Company', remove: deleteCompany });
 *   // list.items, list.showCreate/setShowCreate, list.editing/setEditing,
 *   // list.deleteTarget/setDeleteTarget, list.handleCreated, list.confirmDelete, …
 */

interface UseEntityListOptions<T extends { id: string }> {
  initialItems: T[];
  /** Human label for delete toast, e.g. "Company" → "Company deleted". */
  entityLabel: string;
  remove: (id: string) => Promise<{ error?: string } | void>;
}

export function useEntityList<T extends { id: string }>({
  initialItems,
  entityLabel,
  remove,
}: UseEntityListOptions<T>) {
  const router = useRouter();
  const { success, error } = useToast();
  const { items, optimisticAdd, optimisticUpdate, optimisticRemove } = useOptimisticList(initialItems);

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add the new row optimistically and close the create dialog. The create
  // action's revalidatePath brings the canonical row in behind the optimistic one.
  const handleCreated = useCallback(
    (item?: T) => {
      if (item) optimisticAdd(item, async () => {});
      setShowCreate(false);
    },
    [optimisticAdd],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    const result = await remove(deleteTarget.id);
    setIsDeleting(false);
    if (result && 'error' in result && result.error) {
      error(result.error);
      return;
    }
    success(`${entityLabel} deleted`);
    setDeleteTarget(null);
    router.refresh();
  }, [deleteTarget, remove, entityLabel, success, error, router]);

  return {
    items,
    optimisticAdd,
    optimisticUpdate,
    optimisticRemove,
    showCreate,
    setShowCreate,
    editing,
    setEditing,
    deleteTarget,
    setDeleteTarget,
    isDeleting,
    isSubmitting,
    setIsSubmitting,
    handleCreated,
    confirmDelete,
  };
}
