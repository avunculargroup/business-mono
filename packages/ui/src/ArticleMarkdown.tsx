import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { isSubscriberScoped } from '@platform/shared';
import styles from './ArticleMarkdown.module.css';

/**
 * Read-only markdown for third-party text — newsletter bodies and followed
 * articles in news_items. Built to be safe for content nobody at BTS wrote:
 *
 *  - raw HTML in the body renders as nothing (skipHtml), never as markup
 *  - only http:, https: and mailto: links survive; anything else keeps its
 *    text and loses its href
 *  - a link that is a tracking wrapper or carries a subscriber token renders
 *    as text, so a click can never register as BTS's paid subscription
 *    (defence in depth: ingest already strips these — @platform/shared newsUrl)
 *  - headings step down one level, so an article's h1 never competes with
 *    the page title
 *  - tables scroll inside their own container, so the page never does
 *
 * No hooks and no client JavaScript: it renders in a server component.
 */

const SAFE_PROTOCOL_RE = /^(?:https?:|mailto:)/i;

function urlTransform(url: string): string | null {
  return SAFE_PROTOCOL_RE.test(url.trim()) ? url : null;
}

function step(Tag: 'h2' | 'h3' | 'h4' | 'h5' | 'h6') {
  // react-markdown passes `node`; it must not reach the DOM.
  return function Heading({ node: _node, ...props }: ComponentPropsWithoutRef<'h2'> & { node?: unknown }) {
    return <Tag {...props} />;
  };
}

const components: Components = {
  h1: step('h2'),
  h2: step('h3'),
  h3: step('h4'),
  h4: step('h5'),
  h5: step('h6'),
  h6: step('h6'),
  a({ node: _node, href, children, ...props }) {
    if (!href || (/^https?:/i.test(href) && isSubscriberScoped(href))) {
      return <span>{children}</span>;
    }
    const external = /^https?:/i.test(href);
    return (
      <a
        {...props}
        href={href}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer nofollow' } : {})}
      >
        {children}
      </a>
    );
  },
  table({ node: _node, ...props }) {
    return (
      <div className={styles.tableScroll} role="region" aria-label="Table" tabIndex={0}>
        <table {...props} />
      </div>
    );
  },
};

export interface ArticleMarkdownProps {
  children: string;
  className?: string;
}

export function ArticleMarkdown({ children, className }: ArticleMarkdownProps): ReactNode {
  return (
    <div className={className ? `${styles.article} ${className}` : styles.article}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={urlTransform}
        disallowedElements={['img']}
        components={components}
      >
        {children}
      </Markdown>
    </div>
  );
}
