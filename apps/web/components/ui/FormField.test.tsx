import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { FormField, FormSelect, FormTextarea } from './FormField';

describe('FormField', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<FormField label="Email" name="email" type="email" />);
    // getByLabelText only resolves when the label is correctly associated.
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('name', 'email');
    expect(input).toHaveAttribute('type', 'email');
  });

  it('marks required fields and reflects it on the control', () => {
    render(<FormField label="Name" name="name" required />);
    expect(screen.getByText('*')).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeRequired();
  });

  it('wires aria-describedby + aria-invalid to the error text', () => {
    render(<FormField label="Email" name="email" error="Invalid email" />);
    const input = screen.getByLabelText('Email');
    const error = screen.getByText('Invalid email');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input.getAttribute('aria-describedby')).toBe(error.id);
    expect(error.id).toBeTruthy();
  });

  it('wires aria-describedby to the hint text', () => {
    render(<FormField label="Slug" name="slug" hint="Lowercase, dashes only" />);
    const input = screen.getByLabelText('Slug');
    const hint = screen.getByText('Lowercase, dashes only');
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input).not.toHaveAttribute('aria-invalid');
  });
});

describe('FormSelect', () => {
  it('associates the label and renders options', () => {
    render(
      <FormSelect label="Stage" name="stage" defaultValue="lead">
        <option value="lead">Lead</option>
        <option value="warm">Warm</option>
      </FormSelect>,
    );
    const select = screen.getByLabelText('Stage');
    expect(select).toHaveAttribute('name', 'stage');
    expect(screen.getByRole('option', { name: 'Warm' })).toBeInTheDocument();
  });
});

describe('FormTextarea', () => {
  it('associates the label with the textarea', () => {
    render(<FormTextarea label="Notes" name="notes" rows={3} />);
    const textarea = screen.getByLabelText('Notes');
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea).toHaveAttribute('name', 'notes');
  });
});
