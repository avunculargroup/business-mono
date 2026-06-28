import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeader } from './PageHeader';

describe('PageHeader', () => {
  it('renders the title', () => {
    render(<PageHeader title="Companies" />);
    expect(screen.getByRole('heading', { name: 'Companies' })).toBeInTheDocument();
  });

  it('omits the back link when no backHref is given', () => {
    render(<PageHeader title="Companies" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders a back link to backHref with the default label', () => {
    render(<PageHeader title="Acme" backHref="/crm/companies" />);
    const link = screen.getByRole('link', { name: 'Back' });
    expect(link).toHaveAttribute('href', '/crm/companies');
  });

  it('uses a custom backLabel as the accessible name', () => {
    render(<PageHeader title="Task" backHref="/tasks" backLabel="Back to tasks" />);
    const link = screen.getByRole('link', { name: 'Back to tasks' });
    expect(link).toHaveAttribute('href', '/tasks');
  });
});
