'use client';

import { forwardRef, useLayoutEffect, useRef } from 'react';

// A textarea that grows to fit its content instead of scrolling inside a fixed
// box. Sizes itself on mount (so values seeded from the server show in full) and
// on every change. CSS supplies the min-height (so empty fields still look like
// inputs) and a max-height safety valve for runaway content.
export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function AutoGrowTextarea({ value, className, ...rest }, forwarded) {
  const innerRef = useRef<HTMLTextAreaElement>(null);

  const setRefs = (el: HTMLTextAreaElement | null) => {
    innerRef.current = el;
    if (typeof forwarded === 'function') forwarded(el);
    else if (forwarded) forwarded.current = el;
  };

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return <textarea ref={setRefs} value={value} className={className} {...rest} />;
});
