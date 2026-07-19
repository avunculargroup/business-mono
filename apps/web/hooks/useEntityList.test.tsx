import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';

import { useEntityList } from './useEntityList';
import { ToastProvider } from '@/providers/ToastProvider';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}

type Row = { id: string; name: string };
const rows: Row[] = [
  { id: '1', name: 'Acme' },
  { id: '2', name: 'Globex' },
];

beforeEach(() => {
  refresh.mockClear();
});

describe('useEntityList', () => {
  it('seeds items and starts with all dialogs closed', () => {
    const { result } = renderHook(
      () => useEntityList<Row>({ initialItems: rows, entityLabel: 'Company', remove: vi.fn() }),
      { wrapper },
    );
    expect(result.current.items).toEqual(rows);
    expect(result.current.showCreate).toBe(false);
    expect(result.current.editing).toBeNull();
    expect(result.current.deleteTarget).toBeNull();
    expect(result.current.isDeleting).toBe(false);
  });

  it('confirmDelete calls the remove action and refreshes on success', async () => {
    const remove = vi.fn().mockResolvedValue({ success: true });
    const { result } = renderHook(
      () => useEntityList<Row>({ initialItems: rows, entityLabel: 'Company', remove }),
      { wrapper },
    );

    act(() => result.current.setDeleteTarget(rows[0]));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(remove).toHaveBeenCalledWith('1');
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.deleteTarget).toBeNull();
  });

  it('confirmDelete leaves the target set and does not refresh on error', async () => {
    const remove = vi.fn().mockResolvedValue({ error: 'Still linked' });
    const { result } = renderHook(
      () => useEntityList<Row>({ initialItems: rows, entityLabel: 'Company', remove }),
      { wrapper },
    );

    act(() => result.current.setDeleteTarget(rows[0]));
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(remove).toHaveBeenCalledWith('1');
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.deleteTarget).toEqual(rows[0]);
    expect(result.current.isDeleting).toBe(false);
  });

  it('confirmDelete is a no-op when nothing is targeted', async () => {
    const remove = vi.fn();
    const { result } = renderHook(
      () => useEntityList<Row>({ initialItems: rows, entityLabel: 'Company', remove }),
      { wrapper },
    );
    await act(async () => {
      await result.current.confirmDelete();
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('handleCreated closes the create dialog', () => {
    const { result } = renderHook(
      () => useEntityList<Row>({ initialItems: rows, entityLabel: 'Company', remove: vi.fn() }),
      { wrapper },
    );
    act(() => result.current.setShowCreate(true));
    expect(result.current.showCreate).toBe(true);
    act(() => result.current.handleCreated());
    expect(result.current.showCreate).toBe(false);
  });
});
