'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type View = 'product' | 'architecture';

interface AnnotationState {
  view: View;
  toggleView: () => void;
  /** The annotation whose panel is open, or null. */
  openId: string | null;
  setOpenId: (id: string | null) => void;
}

const AnnotationContext = createContext<AnnotationState | null>(null);

/**
 * Which view the demo is in, and which annotation panel is open.
 *
 * **Product view is the default.** Show the real thing first and let the reader
 * opt into the explanation — an app that opens covered in callouts is a
 * diagram, and the point of building this on the actual platform was that it is
 * not one.
 *
 * Deliberately not persisted. A reader arriving from a shared link should get
 * the product, not whatever mode the last visitor left it in.
 */
export function AnnotationProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('product');
  const [openId, setOpenId] = useState<string | null>(null);

  const toggleView = useCallback(() => {
    setView((current) => (current === 'product' ? 'architecture' : 'product'));
    // Leaving architecture view with a panel open would strand it: the panel is
    // only rendered in that view, so its close button would go with it.
    setOpenId(null);
  }, []);

  const value = useMemo(
    () => ({ view, toggleView, openId, setOpenId }),
    [view, toggleView, openId],
  );

  return <AnnotationContext.Provider value={value}>{children}</AnnotationContext.Provider>;
}

export function useAnnotationView(): AnnotationState {
  const state = useContext(AnnotationContext);
  if (!state) {
    throw new Error('useAnnotationView must be used within an AnnotationProvider');
  }
  return state;
}
