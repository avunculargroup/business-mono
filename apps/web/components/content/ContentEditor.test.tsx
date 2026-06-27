import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ContentEditor } from './ContentEditor';

vi.mock('@/app/actions/content', () => ({
  updateContentStatus: vi.fn(async () => ({})),
}));
vi.mock('@/providers/ToastProvider', () => ({
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
});
