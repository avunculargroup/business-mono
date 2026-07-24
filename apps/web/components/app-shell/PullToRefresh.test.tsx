import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useRef } from 'react';
import { render } from '@testing-library/react';
import { act } from 'react';

import { PullToRefresh } from './PullToRefresh';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

/** A scrollable host whose scrollTop we can control, wrapping the component under test. */
function Host({ scrollTop = 0 }: { scrollTop?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={(node) => {
        if (node) Object.defineProperty(node, 'scrollTop', { value: scrollTop, configurable: true });
        (ref as { current: HTMLDivElement | null }).current = node;
      }}
      data-testid="scroll"
    >
      <PullToRefresh scrollRef={ref} />
    </div>
  );
}

function touchEvent(type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'touches', { value: [{ clientY }] });
  return e;
}

function pull(el: HTMLElement, deltaY: number) {
  act(() => {
    el.dispatchEvent(touchEvent('touchstart', 0));
    el.dispatchEvent(touchEvent('touchmove', deltaY));
    el.dispatchEvent(touchEvent('touchend', deltaY));
  });
}

describe('PullToRefresh', () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it('is hidden until the user pulls', () => {
    const { container } = render(<Host />);
    const indicator = container.querySelector('[aria-hidden]');
    expect(indicator).toHaveAttribute('aria-hidden', 'true');
  });

  it('refreshes when pulled past the threshold from the top', () => {
    const { getByTestId } = render(<Host scrollTop={0} />);
    pull(getByTestId('scroll'), 200);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on a short pull below the threshold', () => {
    const { getByTestId } = render(<Host scrollTop={0} />);
    pull(getByTestId('scroll'), 40);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not arm when the container is already scrolled down', () => {
    const { getByTestId } = render(<Host scrollTop={120} />);
    pull(getByTestId('scroll'), 200);
    expect(refresh).not.toHaveBeenCalled();
  });
});
