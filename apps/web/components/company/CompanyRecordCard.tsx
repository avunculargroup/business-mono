'use client';

import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { Pencil, Trash2 } from 'lucide-react';
import type { CompanyRecord } from '@platform/shared';
import { COMPANY_CONTENT_TYPE_LABELS } from '@platform/shared';
import styles from './CompanyRecordCard.module.css';

const CHIP_COLORS: Record<string, 'neutral' | 'accent' | 'success' | 'warning'> = {
  text:     'neutral',
  markdown: 'accent',
  image:    'success',
  file:     'warning',
};

interface CompanyRecordCardProps {
  record: CompanyRecord;
  signedUrl?: string;
  onEdit: (record: CompanyRecord) => void;
  onDelete: (record: CompanyRecord) => void;
}

export function CompanyRecordCard({ record, signedUrl, onEdit, onDelete }: CompanyRecordCardProps) {
  const contentType = record.type?.content_type ?? 'text';
  const typeLabel = record.type?.label ?? record.type_key;

  const preview = (() => {
    if (contentType === 'image') {
      return signedUrl ? (
        <img src={signedUrl} alt={typeLabel} className={styles.thumbnail} />
      ) : (
        <span className={styles.preview}>{record.filename ?? 'Image'}</span>
      );
    }
    if (contentType === 'file') {
      return <span className={styles.preview}>{record.filename ?? 'File'}</span>;
    }
    if (record.value) {
      const text = record.value.length > 120 ? `${record.value.slice(0, 120)}…` : record.value;
      return <span className={styles.preview}>{text}</span>;
    }
    return null;
  })();

  return (
    <Card hoverable padding="md" className={styles.card}>
      <div className={styles.header}>
        <div className={styles.meta}>
          <span className={styles.typeLabel}>{typeLabel}</span>
          <StatusChip
            label={COMPANY_CONTENT_TYPE_LABELS[contentType] ?? contentType}
            color={CHIP_COLORS[contentType] ?? 'neutral'}
          />
        </div>
        <RowActionsMenu
          actions={[
            {
              label: 'Edit',
              icon: <Pencil size={14} strokeWidth={1.5} />,
              onClick: () => onEdit(record),
            },
            {
              label: 'Delete',
              icon: <Trash2 size={14} strokeWidth={1.5} />,
              onClick: () => onDelete(record),
              destructive: true,
            },
          ]}
        />
      </div>
      {preview && <div className={styles.body}>{preview}</div>}
    </Card>
  );
}
