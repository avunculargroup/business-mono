import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArticleMarkdown } from './ArticleMarkdown';

describe('ArticleMarkdown', () => {
  it('renders raw HTML in a body as nothing, never as markup', () => {
    const { container } = render(
      <ArticleMarkdown>{'Before <script>alert(1)</script><b>bold</b> after'}</ArticleMarkdown>,
    );
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container).toHaveTextContent('Before');
  });

  it('opens an http link in a new tab without referrer or follow', () => {
    render(<ArticleMarkdown>{'[RBA holds](https://www.rba.gov.au/media-releases/x.html)'}</ArticleMarkdown>);
    const link = screen.getByRole('link', { name: 'RBA holds' });
    expect(link).toHaveAttribute('href', 'https://www.rba.gov.au/media-releases/x.html');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow');
  });

  it('keeps a mailto link, in the same tab', () => {
    render(<ArticleMarkdown>{'[Write in](mailto:desk@example.com)'}</ArticleMarkdown>);
    const link = screen.getByRole('link', { name: 'Write in' });
    expect(link).toHaveAttribute('href', 'mailto:desk@example.com');
    expect(link).not.toHaveAttribute('target');
  });

  it.each(['javascript:alert(1)', 'data:text/html,x', 'vbscript:x', 'file:///etc/passwd'])(
    'renders a %s link as text',
    (href) => {
      render(<ArticleMarkdown>{`[click](${href})`}</ArticleMarkdown>);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('click')).toBeInTheDocument();
    },
  );

  it.each([
    'https://d1.na1.hubspotlinks.com/Ctc/placeholder',
    'https://example.ghost.io/r/0a1b2c3d?m=placeholder',
    'https://afr.com/story?_hsenc=placeholder',
    'https://seekingalpha.com/article/1?userid=1',
  ])('renders a subscriber-scoped link as text: %s', (href) => {
    render(<ArticleMarkdown>{`[the report](${href})`}</ArticleMarkdown>);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('the report')).toBeInTheDocument();
  });

  it('wraps a GFM table in its own scroll container', () => {
    render(<ArticleMarkdown>{'| Metric | Value |\n| --- | --- |\n| Hashrate | 1,000 EH/s |'}</ArticleMarkdown>);
    const region = screen.getByRole('region', { name: 'Table' });
    expect(region.querySelector('table')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Metric' })).toBeInTheDocument();
  });

  it("steps headings down one level so an article's h1 never competes with the page title", () => {
    render(<ArticleMarkdown>{'# Article title\n\n## Section'}</ArticleMarkdown>);
    expect(screen.getByRole('heading', { level: 2, name: 'Article title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Section' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('drops images', () => {
    const { container } = render(<ArticleMarkdown>{'![chart](https://cdn.example/x.png)'}</ArticleMarkdown>);
    expect(container.querySelector('img')).toBeNull();
  });

  it('renders on the server with no client hooks', () => {
    const html = renderToStaticMarkup(<ArticleMarkdown>{'Plain **text**'}</ArticleMarkdown>);
    expect(html).toContain('<strong>text</strong>');
  });
});
