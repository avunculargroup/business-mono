import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ClientDataContext } from '@platform/data';
import { fakeClientRepositories } from '@/test/mocks/repositories';

let repositories: ClientDataContext;
vi.mock('@/lib/repositories', async () => {
  const actual = await vi.importActual<typeof import('@/lib/repositories')>('@/lib/repositories');
  return { ...actual, requireClientRepositories: vi.fn(async () => repositories) };
});

import AccountPage from './page';

beforeEach(() => {
  repositories = fakeClientRepositories();
});

describe('AccountPage', () => {
  it('shows the subscription and its seats', async () => {
    render(await AccountPage());

    // The name sits inside a fuller sentence in the header, so match the text
    // rather than the node.
    expect(document.body.textContent).toContain('Sample Holdings Ltd');
    expect(screen.getByText(/A\. Subscriber/)).toBeInTheDocument();
  });

  it('offers nothing to edit', async () => {
    // The write surface of this app is two methods and neither is here. Seats
    // are managed by BTS, so an edit control would be a promise the app cannot
    // keep — and the sweep that found this page untested is the reason the
    // absence is now asserted rather than assumed.
    render(await AccountPage());

    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    for (const button of screen.queryAllByRole('button')) {
      expect(button.textContent ?? '').not.toMatch(/edit|change|update|remove|delete/i);
    }
  });

  it('lists what has been acknowledged, which is the audit trail a subscriber can see', async () => {
    render(await AccountPage());

    expect(document.body.textContent).toMatch(/0\.1/);
  });
});
