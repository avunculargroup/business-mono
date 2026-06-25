'use client';

import { Plus, Pencil, Star, Trash2, MessageSquareQuote } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import type { VoiceSnippetRow } from './voiceTypes';
import styles from '@/app/(app)/brand/voice.module.css';

interface SnippetsPanelProps {
  title?: string;
  emptyDescription?: string;
  /** Inherited company-canon snippets, shown read-only — edit them on the company voice. */
  canonSnippets?: VoiceSnippetRow[];
  /** Snippets owned by this voice — editable here. */
  ownSnippets: VoiceSnippetRow[];
  onAdd: () => void;
  onEdit: (snippet: VoiceSnippetRow) => void;
  onToggleStar: (snippet: VoiceSnippetRow) => void;
  onDelete: (snippet: VoiceSnippetRow) => void;
}

function snippetMeta(s: VoiceSnippetRow): string {
  const tags = s.topic_tags.length > 0 ? ` · ${s.topic_tags.join(', ')}` : '';
  return `${s.snippet_type.replace('_', ' ')} · ${s.platform ?? 'any'}${tags}`;
}

function SnippetRow({
  snippet,
  readOnly,
  onEdit,
  onToggleStar,
  onDelete,
}: {
  snippet: VoiceSnippetRow;
  readOnly: boolean;
  onEdit: (s: VoiceSnippetRow) => void;
  onToggleStar: (s: VoiceSnippetRow) => void;
  onDelete: (s: VoiceSnippetRow) => void;
}) {
  return (
    <div className={styles.snippet}>
      <div className={styles.snippetMeta}>
        <span className={styles.metaChip}>{snippetMeta(snippet)}</span>
        {readOnly ? (
          <span className={styles.inheritTag}>inherited (canon)</span>
        ) : (
          <div className={styles.snippetActions}>
            <button
              type="button"
              className={`${styles.iconButton} ${snippet.is_starred ? styles.starActive : ''}`}
              onClick={() => onToggleStar(snippet)}
              aria-label={snippet.is_starred ? 'Unstar' : 'Star'}
              title={snippet.is_starred ? 'Starred — agents weight these up' : 'Star this exemplar'}
            >
              <Star size={15} strokeWidth={1.5} fill={snippet.is_starred ? 'currentColor' : 'none'} />
            </button>
            <button type="button" className={styles.iconButton} onClick={() => onEdit(snippet)} aria-label="Edit snippet">
              <Pencil size={15} strokeWidth={1.5} />
            </button>
            <button type="button" className={styles.iconButton} onClick={() => onDelete(snippet)} aria-label="Delete snippet">
              <Trash2 size={15} strokeWidth={1.5} />
            </button>
          </div>
        )}
      </div>
      <div className={styles.snippetBody}>{snippet.body}</div>
      {snippet.curator_note && <div className={styles.curatorNote}>{snippet.curator_note}</div>}
    </div>
  );
}

export function SnippetsPanel({
  title = 'Snippets',
  emptyDescription = 'Exemplars show the voice rather than describe it — the strongest input to on-voice writing. Add phrases, openers, or full posts with a note on why each works.',
  canonSnippets = [],
  ownSnippets,
  onAdd,
  onEdit,
  onToggleStar,
  onDelete,
}: SnippetsPanelProps) {
  const isEmpty = canonSnippets.length === 0 && ownSnippets.length === 0;

  return (
    <div>
      <div className={styles.panelHeader}>
        <span className={styles.panelTitle}>{title}</span>
        <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
          <Plus size={14} strokeWidth={1.5} />
          Add snippet
        </Button>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={MessageSquareQuote}
          title="No snippets yet"
          description={emptyDescription}
          actionLabel="Add snippet"
          onAction={onAdd}
        />
      ) : (
        <div className={styles.snippetList}>
          {canonSnippets.map((s) => (
            <SnippetRow key={s.id} snippet={s} readOnly onEdit={onEdit} onToggleStar={onToggleStar} onDelete={onDelete} />
          ))}
          {ownSnippets.map((s) => (
            <SnippetRow key={s.id} snippet={s} readOnly={false} onEdit={onEdit} onToggleStar={onToggleStar} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
