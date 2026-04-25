'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import styles from './MarkdownRecordDisplay.module.css';

interface MarkdownRecordDisplayProps {
  content: string;
}

export function MarkdownRecordDisplay({ content }: MarkdownRecordDisplayProps) {
  const editor = useEditor({
    extensions: [StarterKit, Markdown.configure({ html: false })],
    content,
    editable: false,
    immediatelyRender: false,
  });

  return <EditorContent editor={editor} className={styles.content} />;
}
