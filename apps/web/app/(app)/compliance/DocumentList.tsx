'use client';

import { useState, useTransition } from 'react';
import { FileCheck } from 'lucide-react';
import { activateComplianceDocument } from '@/app/actions/complianceDocuments';
import styles from './compliance.module.css';

export interface DocumentRow {
  id: string;
  docType: string;
  title: string;
  version: string;
  status: string;
  effectiveFrom: string | null;
  /** True when every placeholder resolves. False means it cannot be published. */
  ready: boolean;
  /** Placeholder keys with no value. Named, not counted. */
  missing: string[];
  /** The fully resolved body, for preview. Empty when not ready. */
  body: string;
}

const TYPE_LABELS: Record<string, string> = {
  service_statement: 'Service Statement',
  information_notice: 'Information-only notice',
  privacy_policy: 'Privacy policy',
  terms: 'Terms',
};

/**
 * Compliance documents, by version, with what each one is blocked on.
 *
 * The preview is the point. The Service Statement gates every route in Minute,
 * so the difference between "published" and "published and renders" is the
 * difference between a working product and a locked door — and the only way to
 * tell them apart before a subscriber does is to resolve the document here and
 * look at it.
 *
 * There is no editing. Bodies live in migrations, the same as `/prepare`
 * template bodies: the migration is the reviewed artefact, and a textarea that
 * saved over one would put the two into silent disagreement.
 */
export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (documents.length === 0) {
    return (
      <p className={styles.empty}>
        No compliance documents. The Service Statement is seeded by a migration; until those are
        applied there is nothing here, and nobody can pass the gate.
      </p>
    );
  }

  function activate(id: string) {
    setError(null);
    setPendingId(id);
    startTransition(async () => {
      const result = await activateComplianceDocument(id);
      if (result.error) setError(result.error);
      setPendingId(null);
    });
  }

  return (
    <ul className={styles.list}>
      {documents.map((doc) => {
        const live = doc.status === 'active';

        return (
          <li key={doc.id} className={styles.card}>
            <div className={styles.cardHead}>
              <div>
                <h3 className={styles.cardTitle}>
                  {TYPE_LABELS[doc.docType] ?? doc.docType} · v{doc.version}
                </h3>
                <p className={styles.cardDetail}>
                  {doc.title}
                  {doc.effectiveFrom ? ` · effective ${doc.effectiveFrom}` : ''}
                </p>
              </div>
              <span className={live ? styles.liveBadge : styles.statusBadge}>
                {live ? 'live' : doc.status.replace(/_/g, ' ')}
              </span>
            </div>

            {!doc.ready && (
              <p className={styles.blocked} role="status">
                Cannot go live: {doc.missing.join(', ')}{' '}
                {doc.missing.length === 1 ? 'has' : 'have'} no value. A subscriber would see
                &ldquo;not available&rdquo; instead of the document.
              </p>
            )}

            <div className={styles.formActions}>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setPreviewId(previewId === doc.id ? null : doc.id)}
                disabled={!doc.ready}
              >
                {previewId === doc.id ? 'Hide preview' : 'Preview as a subscriber sees it'}
              </button>

              {!live && (
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => activate(doc.id)}
                  disabled={!doc.ready || pending}
                >
                  <FileCheck size={16} strokeWidth={1.5} />
                  {pending && pendingId === doc.id ? 'Publishing…' : 'Publish this version'}
                </button>
              )}
            </div>

            {previewId === doc.id && doc.ready && (
              <pre className={styles.preview}>{doc.body}</pre>
            )}

            {error && pendingId === null && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
