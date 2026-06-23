import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

import { Button } from './Button';
import { hasLocalClass } from '@/test/cssClass';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Save changes</Button>);
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('calls onClick when pressed', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);

    await userEvent.click(screen.getByRole('button', { name: 'Go' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('is disabled and unclickable while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Saving' });
    expect(button).toBeDisabled();

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('respects an explicit disabled prop', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });

  it('forwards native button attributes (e.g. type)', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveAttribute('type', 'submit');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ref</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)(
    'maps variant="%s" to the matching variant class',
    (variant) => {
      render(<Button variant={variant}>X</Button>);
      expect(hasLocalClass(screen.getByRole('button'), variant)).toBe(true);
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('maps size="%s" to the matching size class', (size) => {
    render(<Button size={size}>X</Button>);
    expect(hasLocalClass(screen.getByRole('button'), size)).toBe(true);
  });

  it('defaults to the primary/md classes', () => {
    render(<Button>X</Button>);
    const button = screen.getByRole('button');
    expect(hasLocalClass(button, 'primary')).toBe(true);
    expect(hasLocalClass(button, 'md')).toBe(true);
  });

  it('adds the loading class while loading', () => {
    render(<Button loading>X</Button>);
    expect(hasLocalClass(screen.getByRole('button'), 'loading')).toBe(true);
  });
});
