import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { SkeletonLoader } from './SkeletonLoader';

const widthsOf = (status: HTMLElement) =>
  Array.from(status.children).map((el) => (el as HTMLElement).style.width);

describe('SkeletonLoader', () => {
  it('renders the requested number of lines at the given height', () => {
    render(<SkeletonLoader lines={4} height="40px" />);

    const status = screen.getByRole('status', { name: 'Loading' });
    expect(status.children).toHaveLength(4);
    expect((status.children[0] as HTMLElement).style.height).toBe('40px');
  });

  it('uses deterministic widths so server and client markup match', () => {
    const { unmount } = render(<SkeletonLoader lines={6} />);
    const first = widthsOf(screen.getByRole('status'));
    unmount();

    render(<SkeletonLoader lines={6} />);
    const second = widthsOf(screen.getByRole('status'));

    expect(second).toEqual(first);
  });
});
