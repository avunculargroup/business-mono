'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/StatusChip';
import {
  updateTemplateVersion,
  createTemplateVersion,
  approveTemplateVersion,
} from '@/app/actions/templates';
import { useToast } from '@/providers/ToastProvider';
import {
  TEMPLATE_VERSION_STATUS_LABELS,
  type TemplateVersionStatus,
} from '@platform/shared';
import type { TemplateRow, TemplateVersionRow } from './TemplatesList';
import styles from './TemplateVersionEditor.module.css';

type SectionRow = { id: string; title: string; content: string };

const VERSION_STATUS_COLORS: Record<string, 'success' | 'warning' | 'neutral'> = {
  approved:   'success',
  draft:      'warning',
  deprecated: 'neutral',
};

function versionToMarkdown(version: TemplateVersionRow): string {
  const md = (version.content as { markdown?: string }).markdown;
  if (md !== undefined) return md;
  const items =
    (version.content as { sections?: SectionRow[] }).sections ??
    (version.content as { slides?: SectionRow[] }).slides ??
    [];
  return items.map((s) => `## ${s.title}\n\n${s.content}`).join('\n\n\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineFormat(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const html: string[] = [];
  let inList = false;
  const buffer: string[] = [];

  const flushBuffer = () => {
    if (buffer.length > 0) {
      const content = buffer.join(' ').trim();
      if (content) html.push(`<p>${inlineFormat(content)}</p>`);
      buffer.length = 0;
    }
  };

  for (const line of lines) {
    if (/^## /.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      flushBuffer();
      html.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
    } else if (/^### /.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      flushBuffer();
      html.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
    } else if (/^[*-] /.test(line)) {
      flushBuffer();
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inlineFormat(line.slice(2))}</li>`);
    } else if (/^-{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
      if (inList) { html.push('</ul>'); inList = false; }
      flushBuffer();
      html.push('<hr>');
    } else if (line.trim() === '') {
      if (inList) { html.push('</ul>'); inList = false; }
      flushBuffer();
    } else {
      if (inList) { html.push('</ul>'); inList = false; }
      buffer.push(line);
    }
  }

  if (inList) html.push('</ul>');
  flushBuffer();

  return html.join('\n');
}

interface TemplateVersionEditorProps {
  template: TemplateRow;
}

export function TemplateVersionEditor({ template }: TemplateVersionEditorProps) {
  const sortedVersions = useMemo(
    () => [...template.mvp_template_versions].sort((a, b) => b.version_number - a.version_number),
    [template.mvp_template_versions],
  );
  const latest = sortedVersions[0] ?? null;

  const [selectedVersionId, setSelectedVersionId] = useState(latest?.id ?? null);
  const [editorContent, setEditorContent] = useState(() =>
    latest ? versionToMarkdown(latest) : '',
  );
  const [savedContent, setSavedContent] = useState(() =>
    latest ? versionToMarkdown(latest) : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const { success, error } = useToast();

  const selectedVersion = sortedVersions.find((v) => v.id === selectedVersionId) ?? null;
  const isDraft   = selectedVersion?.status === 'draft';
  const isDirty   = editorContent !== savedContent;
  const wordCount = editorContent.trim() ? editorContent.trim().split(/\s+/).length : 0;
  const preview   = useMemo(() => renderMarkdown(editorContent), [editorContent]);

  const handleVersionChange = (versionId: string) => {
    const version = sortedVersions.find((v) => v.id === versionId) ?? null;
    if (!version) return;
    setSelectedVersionId(version.id);
    const content = versionToMarkdown(version);
    setEditorContent(content);
    setSavedContent(content);
  };

  const handleSave = async () => {
    if (!selectedVersion || !isDraft) return;
    setIsSubmitting(true);
    const result = await updateTemplateVersion(selectedVersion.id, { markdown: editorContent });
    setIsSubmitting(false);
    if (result.error) { error(result.error); return; }
    setSavedContent(editorContent);
    success('Draft saved');
    router.refresh();
  };

  const handleFork = async () => {
    if (!selectedVersion) return;
    setIsSubmitting(true);
    const fd = new FormData();
    fd.set('content', JSON.stringify({ markdown: editorContent }));
    const result = await createTemplateVersion(template.id, fd);
    setIsSubmitting(false);
    if (result.error) { error(result.error); return; }
    success(`Version ${result.version_number} created as draft`);
    router.refresh();
  };

  const handleApprove = async () => {
    if (!selectedVersion) return;
    setIsSubmitting(true);
    const result = await approveTemplateVersion(template.id, selectedVersion.id);
    setIsSubmitting(false);
    if (result.error) { error(result.error); return; }
    success('Version approved');
    router.refresh();
  };

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Link href="/discovery/templates" className={styles.backLink}>
          <ChevronLeft size={15} strokeWidth={1.5} />
          Templates
        </Link>
        <div className={styles.toolbarDivider} />
        {sortedVersions.length > 0 && (
          <select
            className={styles.versionSelect}
            value={selectedVersionId ?? ''}
            onChange={(e) => handleVersionChange(e.target.value)}
            aria-label="Select version"
          >
            {sortedVersions.map((v) => (
              <option key={v.id} value={v.id}>
                v{v.version_number} — {v.status}
              </option>
            ))}
          </select>
        )}
        {selectedVersion && (
          <StatusChip
            label={
              TEMPLATE_VERSION_STATUS_LABELS[selectedVersion.status as TemplateVersionStatus] ??
              selectedVersion.status
            }
            color={VERSION_STATUS_COLORS[selectedVersion.status] ?? 'neutral'}
          />
        )}
        <div className={styles.toolbarSpacer} />
        {isDraft && (
          <Button variant="ghost" size="sm" onClick={handleApprove} loading={isSubmitting}>
            Approve
          </Button>
        )}
        {isDraft ? (
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            loading={isSubmitting}
            disabled={!isDirty}
          >
            Save
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handleFork} loading={isSubmitting}>
            Save as new draft
          </Button>
        )}
      </div>

      {selectedVersion ? (
        <div className={styles.layout}>
          <div className={styles.writePane}>
            <textarea
              className={styles.textarea}
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              placeholder="Start writing in markdown…"
              spellCheck
              aria-label="Markdown editor"
            />
            <div className={styles.wordCount}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</div>
          </div>
          <div className={styles.previewPane}>
            <div
              className={styles.preview}
              dangerouslySetInnerHTML={{ __html: preview }}
            />
          </div>
        </div>
      ) : (
        <div className={styles.empty}>
          No versions yet. Go back to create one.
        </div>
      )}
    </div>
  );
}
