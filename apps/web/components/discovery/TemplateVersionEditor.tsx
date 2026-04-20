'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
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
import { RichTextToolbar } from './RichTextToolbar';
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
  const [savedContent, setSavedContent] = useState(() =>
    latest ? versionToMarkdown(latest) : '',
  );
  const [editorContent, setEditorContent] = useState(() =>
    latest ? versionToMarkdown(latest) : '',
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const router = useRouter();
  const { success, error } = useToast();

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown.configure({ html: false, tightLists: true }),
    ],
    content: latest ? versionToMarkdown(latest) : '',
    onUpdate: ({ editor: e }) => {
      const md = e.storage.markdown.getMarkdown() as string;
      setEditorContent(md);
    },
  });

  const selectedVersion = sortedVersions.find((v) => v.id === selectedVersionId) ?? null;
  const isDraft   = selectedVersion?.status === 'draft';
  const isDirty   = editorContent !== savedContent;
  const wordCount = editorContent.trim() ? editorContent.trim().split(/\s+/).length : 0;

  // Keep editor editability in sync with version status
  if (editor && editor.isEditable !== isDraft) {
    editor.setEditable(isDraft);
  }

  const handleVersionChange = (versionId: string) => {
    const version = sortedVersions.find((v) => v.id === versionId) ?? null;
    if (!version) return;
    setSelectedVersionId(version.id);
    const content = versionToMarkdown(version);
    setEditorContent(content);
    setSavedContent(content);
    editor?.commands.setContent(content);
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
        <div className={styles.editorWrapper}>
          {isDraft && <RichTextToolbar editor={editor} />}
          <div className={styles.editorScroll}>
            <EditorContent editor={editor} className={styles.editorContent} />
            <div className={styles.wordCount}>
              {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </div>
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
