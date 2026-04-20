'use client';

import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Code,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Minus,
  Undo2,
  Redo2,
} from 'lucide-react';
import styles from './TemplateVersionEditor.module.css';

interface ToolbarButtonProps {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  icon: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, label, icon }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.toolbarBtn} ${active ? styles.active : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      aria-pressed={active}
    >
      {icon}
    </button>
  );
}

function Sep() {
  return <span className={styles.toolbarSep} aria-hidden />;
}

interface RichTextToolbarProps {
  editor: Editor | null;
}

export function RichTextToolbar({ editor }: RichTextToolbarProps) {
  if (!editor) return <div className={styles.formattingToolbar} />;

  const iconSize = 14;

  return (
    <div className={styles.formattingToolbar} role="toolbar" aria-label="Text formatting">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive('bold')}
        label="Bold"
        icon={<Bold size={iconSize} strokeWidth={1.75} />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive('italic')}
        label="Italic"
        icon={<Italic size={iconSize} strokeWidth={1.75} />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        active={editor.isActive('code')}
        label="Inline code"
        icon={<Code size={iconSize} strokeWidth={1.75} />}
      />

      <Sep />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive('heading', { level: 2 })}
        label="Heading 2"
        icon={<Heading2 size={iconSize} strokeWidth={1.75} />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive('heading', { level: 3 })}
        label="Heading 3"
        icon={<Heading3 size={iconSize} strokeWidth={1.75} />}
      />

      <Sep />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive('bulletList')}
        label="Bullet list"
        icon={<List size={iconSize} strokeWidth={1.75} />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive('orderedList')}
        label="Ordered list"
        icon={<ListOrdered size={iconSize} strokeWidth={1.75} />}
      />

      <Sep />

      <ToolbarButton
        onClick={() => editor.chain().focus().setHorizontalRule().run()}
        label="Divider"
        icon={<Minus size={iconSize} strokeWidth={1.75} />}
      />

      <Sep />

      <ToolbarButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        label="Undo"
        icon={<Undo2 size={iconSize} strokeWidth={1.75} />}
      />
      <ToolbarButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        label="Redo"
        icon={<Redo2 size={iconSize} strokeWidth={1.75} />}
      />
    </div>
  );
}
