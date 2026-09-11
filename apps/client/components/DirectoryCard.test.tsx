import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DirectoryEntry } from '@platform/data';
import { DirectoryCard } from './DirectoryCard';

/**
 * Assertion 6 of the client conformance list.
 *
 * The other seven are adapter properties and live in
 * `packages/data/src/testing/client.ts`. This one is a render property and
 * cannot be asserted there, which is why that file names this one.
 */
function entry(overrides: Partial<DirectoryEntry> = {}): DirectoryEntry {
  return {
    id: 'e1',
    name: 'A custody provider',
    category: 'Custody',
    australianOwned: true,
    isFinancialProduct: false,
    regulatoryStatus: null,
    disclosure: null,
    ...overrides,
  };
}

describe('a financial product entry', () => {
  it('emits no anchor at all', () => {
    const { container } = render(<DirectoryCard entry={entry({ isFinancialProduct: true })} />);

    // Not a disabled link, not a link styled inert. No `<a>` element exists.
    // A reader who can act from the page is being distributed to rather than
    // reported to, and that is the line s764A(1) draws.
    expect(container.querySelectorAll('a')).toHaveLength(0);
  });

  it('emits no contact action', () => {
    render(<DirectoryCard entry={entry({ isFinancialProduct: true })} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('says why the entry carries no link, rather than looking unfinished', () => {
    render(<DirectoryCard entry={entry({ isFinancialProduct: true })} />);

    expect(screen.getByText(/financial product under s764A\(1\)/)).toBeInTheDocument();
  });

  it('still emits no anchor when a regulatory source url is present', () => {
    // The most likely way this rule gets broken: a source link added to the
    // status row without anyone thinking of it as a call to action.
    const { container } = render(
      <DirectoryCard
        entry={entry({
          isFinancialProduct: true,
          regulatoryStatus: {
            status: 'AFSL application lodged',
            asAt: '2026-08-14',
            sourceName: 'ASIC register',
            sourceUrl: 'https://example.test/asic',
          },
        })}
      />,
    );

    expect(container.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('disclosure', () => {
  it('states plainly when there is no relationship, rather than leaving a blank', () => {
    render(<DirectoryCard entry={entry()} />);

    expect(
      screen.getByText(/no commercial relationship with this entity/),
    ).toBeInTheDocument();
  });

  it('renders an authored disclosure verbatim', () => {
    const text = 'This firm refers work to BTS informally. No fee is paid in either direction.';
    render(<DirectoryCard entry={entry({ disclosure: text })} />);

    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe('neutrality', () => {
  it('shows australian ownership as a fact', () => {
    render(<DirectoryCard entry={entry({ australianOwned: true })} />);
    expect(screen.getByText('Australian owned')).toBeInTheDocument();
  });

  it('says an untracked regulatory status is untracked', () => {
    // A stale status is worse than none during the transition period, so an
    // absent one is stated rather than omitted.
    render(<DirectoryCard entry={entry({ regulatoryStatus: null })} />);
    expect(screen.getByText('Not currently tracked')).toBeInTheDocument();
  });

  it('carries no word that reads as endorsement', () => {
    const { container } = render(
      <DirectoryCard entry={entry({ disclosure: 'A reciprocal arrangement, no fee.' })} />,
    );

    const text = container.textContent ?? '';
    for (const word of ['recommend', 'best', 'leading', 'preferred', 'trusted', 'top']) {
      expect(text.toLowerCase()).not.toContain(word);
    }
  });
});
