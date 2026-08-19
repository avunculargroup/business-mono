import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';

import { AutoGrowTextarea } from './AutoGrowTextarea';

// Note: jsdom reports scrollHeight as 0, so the auto-grow sizing itself can't be
// asserted here — that's verified visually. These cover the render + event wiring
// and the forwarded ref.
describe('AutoGrowTextarea', () => {
  it('renders the passed value', () => {
    render(<AutoGrowTextarea value="hello" onChange={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveValue('hello');
  });

  it('forwards onChange', async () => {
    const onChange = vi.fn();
    render(<AutoGrowTextarea value="" onChange={onChange} />);

    await userEvent.type(screen.getByRole('textbox'), 'a');

    expect(onChange).toHaveBeenCalled();
  });

  it('forwards native textarea attributes (e.g. placeholder)', () => {
    render(<AutoGrowTextarea value="" onChange={() => {}} placeholder="Type here" />);
    expect(screen.getByPlaceholderText('Type here')).toBeInTheDocument();
  });

  it('forwards a ref to the underlying textarea element', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<AutoGrowTextarea ref={ref} value="" onChange={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});
