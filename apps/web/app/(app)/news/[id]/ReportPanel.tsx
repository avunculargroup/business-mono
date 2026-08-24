'use client';

import { useState } from 'react';
import { Download, AlertTriangle, History } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@platform/ui/Button';
import { useToast } from '@platform/ui/ToastProvider';
import { formatDate } from '@/lib/utils';
import { getReportFileUrl, saveReportCuratorNote } from './actions';
import { REPORT_REDISTRIBUTION_LABELS, REPORT_TYPE_LABELS } from '@platform/shared';
import type { NewsReport } from '@platform/data';
import styles from './detail.module.css';

const DATE_SOURCE_LABELS: Record<string, string> = {
  pdf_metadata: 'from the PDF metadata',
  scraped: 'scraped from the page',
  http_last_modified: 'from the HTTP Last-Modified header',
};

const QUALITY_NOTES: Record<string, string> = {
  partial:
    'Some pages could not be read cleanly. The text below is incomplete, and the relevance score was made knowing that.',
  failed:
    'The text layer could not be read. The original file is stored and downloadable, but there is no usable text and nothing has been indexed.',
};

function formatBytes(bytes: number | null): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  report: NewsReport;
}

export function ReportPanel({ report }: Props) {
  const [note, setNote] = useState(report.curatorNote ?? '');
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const { success, error } = useToast();

  const handleDownload = async () => {
    setDownloading(true);
    const result = await getReportFileUrl(report.id);
    setDownloading(false);
    if (!result.success) return error(result.error);
    window.open(result.url, '_blank', 'noopener,noreferrer');
  };

  const handleSaveNote = async () => {
    setSaving(true);
    const result = await saveReportCuratorNote(report.id, note);
    setSaving(false);
    if (result.error) return error(result.error);
    success('Note saved');
  };

  const qualityNote = report.extractionQuality ? QUALITY_NOTES[report.extractionQuality] : undefined;
  const size = formatBytes(report.fileSizeBytes);

  return (
    <section className={styles.reportPanel} aria-label="Report details">
      <div className={styles.reportBadges}>
        <span className={styles.formatBadge}>{report.fileFormat.toUpperCase()}</span>
        <span className={styles.reportTypeChip}>{REPORT_TYPE_LABELS[report.reportType]}</span>
        <span
          className={
            report.redistribution === 'internal_only'
              ? styles.redistributionInternal
              : styles.redistributionOpen
          }
        >
          {REPORT_REDISTRIBUTION_LABELS[report.redistribution]}
        </span>
        {report.pageCount != null && (
          <span className={styles.mono}>{report.pageCount} pp</span>
        )}
        {report.wordCount != null && (
          <span className={styles.mono}>{report.wordCount.toLocaleString()} words</span>
        )}
      </div>

      {qualityNote && (
        <p className={styles.extractionWarning}>
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
          {qualityNote}
        </p>
      )}

      {report.isRevision && (
        <p className={styles.revisionNotice}>
          <History size={14} strokeWidth={1.5} aria-hidden="true" />
          The publisher changed this document after we first stored it. The earlier version is kept
          {report.supersededItemId ? (
            <>
              {' '}
              and is still readable <Link href={`/news/${report.supersededItemId}`}>here</Link>.
            </>
          ) : (
            ' in the archive.'
          )}
        </p>
      )}

      <dl className={styles.reportMeta}>
        {report.publisher && (
          <>
            <dt>Publisher</dt>
            <dd>{report.publisher}</dd>
          </>
        )}
        <dt>Published</dt>
        <dd>
          {report.publishedAt ? formatDate(report.publishedAt) : 'Unknown'}
          {report.publishedAtSource && (
            <span className={styles.muted}> — {DATE_SOURCE_LABELS[report.publishedAtSource]}</span>
          )}
        </dd>
        <dt>Acquired</dt>
        <dd>
          {formatDate(report.createdAt)}
          {size && <span className={styles.muted}> — {size}</span>}
        </dd>
        <dt>Extraction</dt>
        <dd>
          {report.extractionMethod ?? 'none'}
          {report.ocrUsed && <span className={styles.muted}> — OCR used</span>}
        </dd>
        <dt>Content hash</dt>
        <dd className={styles.mono} title={report.contentHash}>
          {report.contentHash.slice(0, 16)}…
        </dd>
        {report.licenceNotes && (
          <>
            <dt>Licence</dt>
            <dd>{report.licenceNotes}</dd>
          </>
        )}
      </dl>

      {/* Prominent rather than tucked at the bottom: the note is the judgement
          agents inherit, and the document is only the evidence for it. */}
      <div className={styles.curatorEditor}>
        <label className={styles.curatorEditorLabel} htmlFor={`note-${report.id}`}>
          Why this matters
        </label>
        <textarea
          id={`note-${report.id}`}
          className={styles.curatorEditorInput}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What this changes for BTS, in your own words."
        />
        <div className={styles.curatorEditorActions}>
          <Button
            type="button"
            variant="secondary"
            onClick={handleSaveNote}
            loading={saving}
            disabled={note === (report.curatorNote ?? '')}
          >
            Save note
          </Button>
          {report.storagePath && (
            <Button type="button" onClick={handleDownload} loading={downloading}>
              <Download size={15} strokeWidth={1.5} />
              Download original
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
