import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageSkeleton } from './PageSkeleton';

describe('PageSkeleton', () => {
  it('defaults to the table variant with a toolbar and six rows', () => {
    render(<PageSkeleton />);

    const root = screen.getByRole('status', { name: 'Loading' });
    expect(root).toHaveAttribute('data-variant', 'table');
    expect(screen.getByTestId('skeleton-toolbar')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(6);
  });

  it('honours rows and hides the toolbar for the table variant', () => {
    render(<PageSkeleton hasToolbar={false} rows={3} />);

    expect(screen.queryByTestId('skeleton-toolbar')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3);
  });

  it('renders the detail variant with a header and one field per row', () => {
    render(<PageSkeleton variant="detail" rows={4} />);

    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('data-variant', 'detail');
    expect(screen.getByTestId('skeleton-header')).toBeInTheDocument();
    expect(screen.getAllByTestId('skeleton-field')).toHaveLength(4);
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument();
  });

  it('hides the header when hasHeader is false for the detail variant', () => {
    render(<PageSkeleton variant="detail" hasHeader={false} />);

    expect(screen.queryByTestId('skeleton-header')).not.toBeInTheDocument();
  });

  it('renders a grid of card tiles for the cards variant', () => {
    render(<PageSkeleton variant="cards" cards={5} />);

    const root = screen.getByRole('status');
    expect(root).toHaveAttribute('data-variant', 'cards');
    expect(screen.getAllByTestId('skeleton-card')).toHaveLength(5);
    expect(screen.queryByTestId('skeleton-row')).not.toBeInTheDocument();
  });
});
