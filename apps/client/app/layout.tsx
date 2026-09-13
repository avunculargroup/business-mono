// Tokens first: globals.css and every *.module.css consume them. Same import
// order as apps/web and apps/demo — Minute is the platform's design system
// applied to a client surface, not a second one.
import '@platform/ui/tokens.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';

/**
 * Fonts are self-hosted rather than linked from Google, matching `apps/demo`.
 *
 * The reason here is different from the demo's. This is an authenticated app
 * behind a login, so nobody is evaluating whether it works offline — but a
 * subscriber may well open it on conference wifi in a board meeting, which is
 * the exact moment a blocking stylesheet in `<head>` is worst. `next/font`
 * serves the faces from this app's own origin, so there is no third-party
 * request in the critical path.
 */
const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-display-loaded',
});

const body = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
  variable: '--font-body-loaded',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-mono-loaded',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  // The product name, not the directory name. Minute is what subscribers see;
  // `client` is what the repository calls it.
  title: {
    default: 'Minute',
    template: '%s · Minute',
  },
  description:
    'Minute, by Bitcoin Treasury Solutions. A monitored, sourced view of the landscape, '
    + 'and the artefacts a finance professional needs to take it into a room.',
  // Invite-only and paid. There is nothing here for a search engine, and a
  // subscriber's surface being indexable would be a surprise to them.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en-AU"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
