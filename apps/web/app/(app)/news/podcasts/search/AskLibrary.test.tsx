import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AskLibrary } from './AskLibrary';
import { askLibraryQuestion, getLibraryQuestion } from '@/app/actions/library';
import type { LibraryQuestion } from '@platform/shared';

vi.mock('@/app/actions/library', () => ({
  askLibraryQuestion: vi.fn(),
  getLibraryQuestion: vi.fn(),
}));

const mockedAsk = vi.mocked(askLibraryQuestion);
const mockedGet = vi.mocked(getLibraryQuestion);

function answered(overrides: Partial<LibraryQuestion> = {}): LibraryQuestion {
  return {
    id: 'q1',
    question: 'How are companies accounting for bitcoin?',
    status: 'answered',
    answer: 'Several guests discussed fair-value accounting under the updated FASB standard.',
    citations: [{ episode_id: 'ep-1', episode_title: 'Custody in 2026', start_seconds: 90, quote: 'Fair value now applies.' }],
    lex_verdict: { passes: true, flags: [], rationale: 'ok', suggested_rewrite: null },
    no_answer: false,
    error: null,
    asked_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    answered_at: '2026-01-01T00:00:05Z',
    ...overrides,
  };
}

async function ask(question: string) {
  fireEvent.change(screen.getByRole('textbox', { name: 'Ask the library a question' }), {
    target: { value: question },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
}

beforeEach(() => {
  mockedAsk.mockReset();
  mockedGet.mockReset();
});

describe('AskLibrary', () => {
  it('renders the synthesised answer with a citation deep-link', async () => {
    mockedAsk.mockResolvedValue({ id: 'q1' });
    mockedGet.mockResolvedValue({ question: answered() });

    render(<AskLibrary />);
    await ask('How are companies accounting for bitcoin?');

    await waitFor(() =>
      expect(screen.getByText(/fair-value accounting under the updated FASB/)).toBeInTheDocument(),
    );
    const link = screen.getByRole('link', { name: /Custody in 2026/ });
    expect(link).toHaveAttribute('href', '/news/podcasts/ep-1?t=90');
  });

  it('shows the no-answer state when the library has nothing', async () => {
    mockedAsk.mockResolvedValue({ id: 'q1' });
    mockedGet.mockResolvedValue({ question: answered({ answer: null, no_answer: true, citations: [] }) });

    render(<AskLibrary />);
    await ask('Anything about altcoins?');

    await waitFor(() => expect(screen.getByText(/doesn.t cover that yet/)).toBeInTheDocument());
  });

  it('warns when compliance flagged the answer', async () => {
    mockedAsk.mockResolvedValue({ id: 'q1' });
    mockedGet.mockResolvedValue({
      question: answered({
        lex_verdict: { passes: false, flags: [], rationale: 'advice framing', suggested_rewrite: null },
      }),
    });

    render(<AskLibrary />);
    await ask('Should we buy now?');

    await waitFor(() => expect(screen.getByText(/Compliance flagged this answer/)).toBeInTheDocument());
  });

  it('surfaces an error from the ask action', async () => {
    mockedAsk.mockResolvedValue({ error: 'Something went wrong.' });

    render(<AskLibrary />);
    await ask('A valid-length question?');

    await waitFor(() => expect(screen.getByText('Something went wrong.')).toBeInTheDocument());
  });
});
