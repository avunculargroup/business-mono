'use client';

import { useState, useTransition } from 'react';
import { FileCheck, PencilLine } from 'lucide-react';
import { activateComplianceDocument } from '@/app/actions/complianceDocuments';
import {
  createComplianceDocumentVersion,
  updateComplianceDocumentBody,
} from '@/app/actions/complianceEditing';
import { BodyEditor } from './BodyEditor';
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
  /** The stored body with its `{{variables}}` intact. What the editor edits. */
  rawBody: string;
}

const TYPE_LABELS: Record<string, string> = {
  service_statement: 'Service Statement',
  information_notice: 'Information-only notice',
  privacy_policy: 'Privacy policy',
  terms: 'Terms',
};

/**
 * The one placeholder that is not a `company_profile` field.
 *
 * It comes from `NEXT_PUBLIC_PRIVACY_POLICY_URL` in *this* app's environment,
 * and naming it in the same breath as `bts_abn` sends someone to the profile
 * form below to look for a field that is not there. Worse, the variable is also
 * read by Minute, so it is usually already set — on the other Vercel project —
 * and the honest answer to "but it is set" is "not here, and not until a
 * redeploy".
 */
const PRIVACY_POLICY_KEY = 'bts_privacy_policy_url';

/**
 * Compliance documents, by version, with what each one is blocked on.
 *
 * The preview is the point. The Service Statement gates every route in Minute,
 * so the difference between "published" and "published and renders" is the
 * difference between a working product and a locked door — and the only way to
 * tell them apart before a subscriber does is to resolve the document here and
 * look at it.
 *
 * Bodies are editable while a document is a draft and frozen once it is live,
 * because `client_disclosures.document_version` records what a subscriber
 * acknowledged: editing live text would leave that record pointing at wording
 * that no longer exists. Changing a live document means cutting a new version,
 * which the editor offers in place of the textarea.
 */
export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
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

            {!doc.ready && doc.missing.includes(PRIVACY_POLICY_KEY) && (
              <p className={styles.blockedDetail}>
                {PRIVACY_POLICY_KEY} is not a field on the profile form below. It reads{' '}
                <code>NEXT_PUBLIC_PRIVACY_POLICY_URL</code> from this app&rsquo;s environment, so
                setting it on the Minute project does not reach here. It is also a{' '}
                <code>NEXT_PUBLIC_</code> variable, which Next.js fixes at build time: after
                setting it, redeploy this app before expecting this line to clear.
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

              <button
                type="button"
                className={styles.ghostButton}
                onClick={() => setEditingId(editingId === doc.id ? null : doc.id)}
              >
                <PencilLine size={16} strokeWidth={1.5} />
                {editingId === doc.id ? 'Close' : live ? 'New version' : 'Edit body'}
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

            {editingId === doc.id && (
              <BodyEditor
                body={doc.rawBody}
                status={doc.status}
                version={doc.version}
                onSave={(body) => updateComplianceDocumentBody(doc.id, body)}
                onNewVersion={(version) => createComplianceDocumentVersion(doc.id, version)}
              />
            )}

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
