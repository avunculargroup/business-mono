'use client';

// Last-resort boundary: catches errors thrown in the root layout itself (e.g.
// the authenticated layout's Supabase calls failing when the database is
// unreachable). It replaces the entire document, so it renders its own
// <html>/<body> and leans on inline styles with hard fallbacks — the design
// system may not have loaded if things failed this early.

import { useEffect } from 'react';
import './globals.css';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[global-error-boundary]', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--color-bg, #FAFAF8)',
          color: 'var(--color-text-primary, #1A1915)',
          fontFamily: 'var(--font-sans, "DM Sans", system-ui, sans-serif)',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display, "Playfair Display", serif)',
              fontSize: 22,
              fontWeight: 600,
              margin: '0 0 8px',
            }}
          >
            Something went wrong
          </h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-secondary, #6B6860)', margin: '0 0 20px' }}>
            We couldn&apos;t load the app just now. This is usually temporary. Try again, and if it keeps happening let us
            know.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              fontFamily: 'inherit',
              fontSize: 14,
              fontWeight: 600,
              color: '#FFFFFF',
              background: 'var(--color-accent-dark, #9A7A2E)',
              border: 'none',
              borderRadius: 10,
              padding: '10px 18px',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
