'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { SkeletonLoader } from './SkeletonLoader';
import styles from './DataTable.module.css';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  width?: string;
  sortable?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onSort?: (key: string, direction: 'asc' | 'desc') => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  loading?: boolean;
  emptyState?: React.ReactNode;
  rowKey?: (row: T) => string;
}

export function DataTable<T>({
  columns,
  data,
  onSort,
  sortKey,
  sortDir,
  onRowClick,
  pagination,
  loading,
  emptyState,
  rowKey,
}: DataTableProps<T>) {
  if (loading) {
    return <SkeletonLoader lines={8} />;
  }

  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  if (data.length === 0) {
    return <EmptyState title="No results" description="No data to display." />;
  }

  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={styles.th}
                style={{ width: col.width, textAlign: col.align || 'left' }}
                onClick={col.sortable && onSort ? () => {
                  const newDir = sortKey === col.key && sortDir === 'asc' ? 'desc' : 'asc';
                  onSort(col.key, newDir);
                } : undefined}
              >
                <span className={col.sortable ? styles.sortable : ''}>
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc'
                      ? <ChevronUp size={14} strokeWidth={1.5} />
                      : <ChevronDown size={14} strokeWidth={1.5} />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr
              key={rowKey ? rowKey(row) : i}
              className={`${styles.tr} ${onRowClick ? styles.clickable : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((col) => (
                <td key={col.key} className={styles.td} style={{ textAlign: col.align || 'left' }}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {pagination && totalPages > 1 && (
        <div className={styles.pagination}>
          <span className={styles.pageInfo}>
            Page {pagination.page} of {totalPages} ({pagination.total} total)
          </span>
          <div className={styles.pageControls}>
            <button
              className={styles.pageBtn}
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
            >
              Previous
            </button>
            <button
              className={styles.pageBtn}
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
