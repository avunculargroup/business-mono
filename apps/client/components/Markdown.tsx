import styles from './Markdown.module.css';

/**
 * A small markdown renderer for authored, reviewed prose.
 *
 * Everything it renders — the Service Statement, library entries, brief
 * narration — is written by BTS and has been through Lex. None of it is user
 * input and none of it is fetched from a third party, which is what makes a
 * renderer this size defensible instead of reckless.
 *
 * It does not render raw HTML, and that is the security property: the input is
 * escaped by React at every leaf, so a stray `<script>` in a library entry
 * renders as the characters `<script>`. No `dangerouslySetInnerHTML` anywhere.
 *
 * Handles what the content actually uses: headings, paragraphs, lists, bold,
 * italic, inline code, and links. A markdown library would add a dependency and
 * a sanitiser to render six constructs.
 */

type Block =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] };

function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      // Clamped at h4: the page owns its h1, and a document promoting itself to
      // h1 would produce two on one page.
      const level = Math.min(Math.max(heading[1]!.length, 2), 4) as 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, text: heading[2]! });
      index += 1;
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const ordered = numbered !== null;
      const items: string[] = [];
      while (index < lines.length) {
        const next = lines[index]!;
        const match = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(next)
          : /^\s*[-*]\s+(.*)$/.exec(next);
        if (!match) break;
        items.push(match[1]!);
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index]!.trim() !== '' && !/^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s)/.test(lines[index]!)) {
      paragraph.push(lines[index]!.trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

/** Inline spans, as React nodes. Never as HTML. */
function inline(text: string, keyPrefix: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let n = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${n}`;
    n += 1;

    if (token.startsWith('**')) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="mono">
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      const href = link[2]!;
      // Only http(s). A `javascript:` href in authored prose would be a
      // surprise, and the cheapest place to make it impossible is here.
      const safe = /^https?:\/\//i.test(href) ? href : '#';
      nodes.push(
        <a key={key} href={safe} target="_blank" rel="noreferrer noopener">
          {link[1]}
        </a>,
      );
    } else {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    }

    last = match.index + token.length;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ children }: { children: string }) {
  const blocks = toBlocks(children);

  return (
    <div className={styles.prose}>
      {blocks.map((block, index) => {
        const key = `b${index}`;

        if (block.kind === 'heading') {
          const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
          return <Tag key={key}>{inline(block.text, key)}</Tag>;
        }

        if (block.kind === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul';
          return (
            <Tag key={key}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
              ))}
            </Tag>
          );
        }

        return <p key={key}>{inline(block.text, key)}</p>;
      })}
    </div>
  );
}
