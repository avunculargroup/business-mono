'use client';

import { useState } from 'react';
import { Download, AlertTriangle, History } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@platform/ui/Button';
import { useToast } from '@platform/ui/ToastProvider';
import { formatDate } from '@/lib/utils';
import { getReportFileUrl, saveReportCuratorNote } from './actions';
import {
  REPORT_REDISTRIBUTION_LABELS,
  REPORT_TYPE_LABELS,
  type ReportRecord,
} from '@platform/shared';
import styles from './detail.module.css';

/** The columns the detail page reads. Narrower than the full row. */
export type ReportPanelRecord = Pick<
  ReportRecord,
  | 'id'
  | 'report_type'
  | 'publisher'
  | 'published_at'
  | 'published_at_source'
  | 'page_count'
  | 'word_count'
  | 'file_format'
  | 'file_size_bytes'
  | 'content_hash'
  | 'extraction_method'
  | 'extraction_quality'
  | 'ocr_used'
  | 'redistribution'
  | 'licence_notes'
  | 'curator_note'
  | 'status'
  | 'storage_path'
  | 'revision_of_report_id'
  | 'created_at'
>;

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
  report: ReportPanelRecord;
  /** The superseded predecessor, when this row is a revision. */
  supersededItemId?: string | null;
}

export function ReportPanel({ report, supersededItemId }: Props) {
  const [note, setNote] = useState(report.curator_note ?? '');
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

  const qualityNote = report.extraction_quality ? QUALITY_NOTES[report.extraction_quality] : undefined;
  const size = formatBytes(report.file_size_bytes);

  return (
    <section className={styles.reportPanel} aria-label="Report details">
      <div className={styles.reportBadges}>
        <span className={styles.formatBadge}>{report.file_format.toUpperCase()}</span>
        <span className={styles.reportTypeChip}>{REPORT_TYPE_LABELS[report.report_type]}</span>
        <span
          className={
            report.redistribution === 'internal_only'
              ? styles.redistributionInternal
              : styles.redistributionOpen
          }
        >
          {REPORT_REDISTRIBUTION_LABELS[report.redistribution]}
        </span>
        {report.page_count != null && (
          <span className={styles.mono}>{report.page_count} pp</span>
        )}
        {report.word_count != null && (
          <span className={styles.mono}>{report.word_count.toLocaleString()} words</span>
        )}
      </div>

      {qualityNote && (
        <p className={styles.extractionWarning}>
          <AlertTriangle size={14} strokeWidth={1.5} aria-hidden="true" />
          {qualityNote}
        </p>
      )}

      {report.revision_of_report_id && (
        <p className={styles.revisionNotice}>
          <History size={14} strokeWidth={1.5} aria-hidden="true" />
          The publisher changed this document after we first stored it. The earlier version is kept
          {supersededItemId ? (
            <>
              {' '}
              and is still readable <Link href={`/news/${supersededItemId}`}>here</Link>.
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
          {report.published_at ? formatDate(report.published_at) : 'Unknown'}
          {report.published_at_source && (
            <span className={styles.muted}> — {DATE_SOURCE_LABELS[report.published_at_source]}</span>
          )}
        </dd>
        <dt>Acquired</dt>
        <dd>
          {formatDate(report.created_at)}
          {size && <span className={styles.muted}> — {size}</span>}
        </dd>
        <dt>Extraction</dt>
        <dd>
          {report.extraction_method ?? 'none'}
          {report.ocr_used && <span className={styles.muted}> — OCR used</span>}
        </dd>
        <dt>Content hash</dt>
        <dd className={styles.mono} title={report.content_hash}>
          {report.content_hash.slice(0, 16)}…
        </dd>
        {report.licence_notes && (
          <>
            <dt>Licence</dt>
            <dd>{report.licence_notes}</dd>
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
            disabled={note === (report.curator_note ?? '')}
          >
            Save note
          </Button>
          {report.storage_path && (
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
