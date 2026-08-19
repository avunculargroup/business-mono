import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ContentEditor } from './ContentEditor';

const updateContentBody = vi.fn((..._args: unknown[]) => Promise.resolve({}));
vi.mock('@/app/actions/content', () => ({
  updateContentStatus: vi.fn(async () => ({})),
  updateContentBody: (...args: unknown[]) => updateContentBody(...args),
  scheduleContent: vi.fn(async () => ({})),
  postContentNow: vi.fn(async () => ({})),
}));
vi.mock('@platform/ui/ToastProvider', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

const baseItem = {
  id: '1',
  title: 'Bitcoin treasuries thread',
  type: 'twitter_x',
  status: 'draft',
  body: null,
  is_thread: true,
  scheduled_for: null,
  published_at: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('ContentEditor', () => {
  it('renders every segment of a thread, not just the first', () => {
    render(
      <ContentEditor
        item={baseItem}
        threadSegments={[
          { id: 's1', body: 'First post in the thread.' },
          { id: 's2', body: 'Second post in the thread.' },
          { id: 's3', body: 'Third post in the thread.' },
        ]}
      />
    );

    expect(screen.getByText('First post in the thread.')).toBeInTheDocument();
    expect(screen.getByText('Second post in the thread.')).toBeInTheDocument();
    expect(screen.getByText('Third post in the thread.')).toBeInTheDocument();
    expect(screen.getByText('3 posts', { exact: false })).toBeInTheDocument();
  });

  it('renders a plain textarea for a non-thread item', () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body: 'A single post body.' }}
        threadSegments={[]}
      />
    );

    expect(screen.getByPlaceholderText('Start writing...')).toHaveValue('A single post body.');
  });

  it('renders a copy button for the draft text', () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body: 'A single post body.' }}
        threadSegments={[]}
      />
    );

    expect(screen.getByRole('button', { name: 'Copy text' })).toBeInTheDocument();
  });

  it('shows a Save button once the body is edited, wired to updateContentBody', async () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body: 'Original.' }}
        threadSegments={[]}
      />
    );

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Start writing...'), {
      target: { value: 'Edited body.' },
    });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    expect(updateContentBody).toHaveBeenCalledWith('1', { body: 'Edited body.' });
  });

  it('shows the char limit and an over-limit warning for LinkedIn drafts', () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body: 'x'.repeat(120) }}
        threadSegments={[]}
        maxChars={100}
      />
    );

    expect(screen.getByText('120 of 100 characters', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/cannot be published until shortened/)).toBeInTheDocument();
  });

  it('previews the pre-fold hook and warns about markdown for long LinkedIn drafts', () => {
    const body = `**Bold claim.** ${'y'.repeat(300)}`;
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body }}
        threadSegments={[]}
        maxChars={3000}
      />
    );

    expect(screen.getByText(/Markdown does not render on LinkedIn/)).toBeInTheDocument();
    expect(screen.getByText(/see\s?more/i, { exact: false })).toBeInTheDocument();
  });

  it('offers Schedule and Post now for an approved LinkedIn post instead of the generic advance', () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'linkedin', is_thread: false, body: 'Post.', status: 'approved' }}
        threadSegments={[]}
      />
    );

    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Post now' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark published' })).not.toBeInTheDocument();
  });

  it('keeps the generic status flow for non-LinkedIn content', () => {
    render(
      <ContentEditor
        item={{ ...baseItem, type: 'newsletter', is_thread: false, body: 'Post.', status: 'approved' }}
        threadSegments={[]}
      />
    );

    expect(screen.getByRole('button', { name: 'Schedule' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Post now' })).not.toBeInTheDocument();
  });

  it('surfaces a publish error for a held scheduled post', () => {
    render(
      <ContentEditor
        item={{
          ...baseItem,
          type: 'linkedin',
          is_thread: false,
          body: 'Post.',
          status: 'scheduled',
          publish_error: 'LinkedIn token has expired — reconnect it in Settings',
        }}
        threadSegments={[]}
      />
    );

    expect(screen.getByText(/token has expired/)).toBeInTheDocument();
  });

  it('shows the feedback box only for drafts linked to a social account', () => {
    const { rerender } = render(
      <ContentEditor
        item={{ ...baseItem, is_thread: false, body: 'Post.', social_account_id: 'acc-li' }}
        threadSegments={[]}
      />
    );
    expect(screen.getByRole('button', { name: 'Save feedback' })).toBeInTheDocument();

    rerender(
      <ContentEditor
        item={{ ...baseItem, is_thread: false, body: 'Post.', social_account_id: null }}
        threadSegments={[]}
      />
    );
    expect(screen.queryByRole('button', { name: 'Save feedback' })).not.toBeInTheDocument();
  });
});
