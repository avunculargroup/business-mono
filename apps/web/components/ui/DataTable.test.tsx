import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTable, type Column } from './DataTable';

type Row = { id: string; name: string };

const data: Row[] = [
  { id: '1', name: 'Alpha' },
  { id: '2', name: 'Beta' },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', render: (r) => r.name, sortable: true },
  { key: 'id', header: 'ID', render: (r) => r.id },
];

describe('DataTable sortable headers', () => {
  it('renders a sortable header as a keyboard-operable button and fires onSort', async () => {
    const onSort = vi.fn();
    render(<DataTable columns={columns} data={data} onSort={onSort} />);

    const sortButton = screen.getByRole('button', { name: /Name/ });
    await userEvent.click(sortButton);
    expect(onSort).toHaveBeenCalledWith('name', 'asc');
  });

  it('reflects the current sort direction via aria-sort', () => {
    render(
      <DataTable columns={columns} data={data} onSort={vi.fn()} sortKey="name" sortDir="asc" />,
    );
    const nameHeader = screen.getByRole('columnheader', { name: /Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('marks an unsorted-but-sortable column with aria-sort="none" and leaves plain columns unset', () => {
    render(<DataTable columns={columns} data={data} onSort={vi.fn()} />);
    const headers = screen.getAllByRole('columnheader');
    expect(headers[0]).toHaveAttribute('aria-sort', 'none'); // sortable, not active
    expect(headers[1]).not.toHaveAttribute('aria-sort'); // plain column
    // The plain column header is not a button.
    expect(screen.queryByRole('button', { name: 'ID' })).not.toBeInTheDocument();
  });
});
