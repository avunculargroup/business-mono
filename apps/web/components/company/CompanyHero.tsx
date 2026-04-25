'use client';

import { Pencil } from 'lucide-react';
import { MarkdownRecordDisplay } from './MarkdownRecordDisplay';
import type { CompanyRecord } from '@platform/shared';
import styles from './CompanyHero.module.css';

interface CompanyHeroProps {
  records: CompanyRecord[];
  signedUrls: Record<string, string>;
  onEdit: (record: CompanyRecord) => void;
  onDelete: (record: CompanyRecord) => void;
}

export function CompanyHero({ records, signedUrls, onEdit }: CompanyHeroProps) {
  if (records.length === 0) return null;

  const logo = records.find((r) => r.type_key === 'logo');
  const others = records.filter((r) => r.type_key !== 'logo');

  return (
    <div className={styles.hero}>
      {logo && signedUrls[logo.id] && (
        <div className={styles.logoRow}>
          <img src={signedUrls[logo.id]} alt="Company logo" className={styles.logo} />
          <button
            type="button"
            className={styles.editBtn}
            onClick={() => onEdit(logo)}
            aria-label="Edit logo"
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}
      {others.length > 0 && (
        <dl className={styles.fields}>
          {others.map((record) => {
            const label = record.type?.label ?? record.type_key;
            const contentType = record.type?.content_type ?? 'text';
            return (
              <div key={record.id} className={styles.field}>
                <dt className={styles.fieldLabel}>{label}</dt>
                <dd className={styles.fieldValue}>
                  {contentType === 'markdown' && record.value ? (
                    <MarkdownRecordDisplay content={record.value} />
                  ) : contentType === 'file' ? (
                    <span>{record.filename ?? record.value}</span>
                  ) : (
                    <span>{record.value}</span>
                  )}
                  <button
                    type="button"
                    className={styles.editBtn}
                    onClick={() => onEdit(record)}
                    aria-label={`Edit ${label}`}
                  >
                    <Pencil size={12} strokeWidth={1.5} />
                  </button>
                </dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}
