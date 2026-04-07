'use client';

import { useOptimistic, useTransition, useCallback } from 'react';

type OptimisticItem = { id: string };

type Action<T extends OptimisticItem> =
  | { type: 'add'; item: T }
  | { type: 'remove'; id: string }
  | { type: 'update'; id: string; data: Partial<T> };

function reducer<T extends OptimisticItem>(state: T[], action: Action<T>): T[] {
  switch (action.type) {
    case 'add':
      return [action.item, ...state];
    case 'remove':
      return state.filter((item) => item.id !== action.id);
    case 'update':
      return state.map((item) =>
        item.id === action.id ? { ...item, ...action.data } : item
      );
  }
}

export function useOptimisticList<T extends OptimisticItem>(serverItems: T[]) {
  const [isPending, startTransition] = useTransition();
  const [optimisticItems, dispatch] = useOptimistic(serverItems, reducer<T>);

  const optimisticAdd = useCallback(
    (item: T, serverAction: () => Promise<{ error?: string } | void>) => {
      startTransition(async () => {
        dispatch({ type: 'add', item });
        const result = await serverAction();
        if (result && 'error' in result && result.error) {
          throw new Error(result.error);
        }
      });
    },
    [dispatch, startTransition]
  );

  const optimisticRemove = useCallback(
    (id: string, serverAction: () => Promise<{ error?: string } | void>) => {
      startTransition(async () => {
        dispatch({ type: 'remove', id });
        const result = await serverAction();
        if (result && 'error' in result && result.error) {
          throw new Error(result.error);
        }
      });
    },
    [dispatch, startTransition]
  );

  const optimisticUpdate = useCallback(
    (id: string, data: Partial<T>, serverAction: () => Promise<{ error?: string } | void>) => {
      startTransition(async () => {
        dispatch({ type: 'update', id, data });
        const result = await serverAction();
        if (result && 'error' in result && result.error) {
          throw new Error(result.error);
        }
      });
    },
    [dispatch, startTransition]
  );

  return {
    items: optimisticItems,
    isPending,
    optimisticAdd,
    optimisticRemove,
    optimisticUpdate,
  };
}
