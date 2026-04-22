interface RichTextBlockProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
}

/** Renders pre-authored rich text HTML from the Tiptap editor. */
export function RichTextBlock({ html, className, style }: RichTextBlockProps) {
  if (!html) return null;
  return (
    <div
      className={className}
      style={style}
      // Tiptap output is sanitised on input; we control all content here
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
