'use client';

import { CompanyRecordCard } from './CompanyRecordCard';
import type { CompanyRecord } from '@platform/shared';
import styles from './CompanyCategory.module.css';

interface CompanyCategoryProps {
  label: string;
  records: CompanyRecord[];
  signedUrls: Record<string, string>;
  onEdit: (record: CompanyRecord) => void;
  onDelete: (record: CompanyRecord) => void;
}

export function CompanyCategory({ label, records, signedUrls, onEdit, onDelete }: CompanyCategoryProps) {
  if (records.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>{label}</h2>
      <div className={styles.grid}>
        {records.map((record) => (
          <CompanyRecordCard
            key={record.id}
            record={record}
            signedUrl={record.storage_path ? signedUrls[record.id] : undefined}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  );
}
