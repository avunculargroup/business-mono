// Tokens first: globals.css and every *.module.css consume them. Same import
// order as apps/web — the demo is the platform's design system, not a copy.
import '@platform/ui/tokens.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DisclosureBanner } from '@/components/DisclosureBanner';
import { Nav } from '@/components/Nav';
import { DemoRepositoryProvider } from '@/providers/DemoRepositoryProvider';
import styles from '@/components/Page.module.css';

/**
 * Rendered per request, not prerendered.
 *
 * Every fixture date is an offset from `ReadContext.asOf`, and `asOf` is
 * `new Date()`. Static prerendering evaluates that once at build time and bakes
 * the result into HTML — so a demo built in August would still be calling
 * August "today" in December, and `listTodayDigest` would return nothing at
 * all. That is the exact failure relative dating exists to prevent, and it is
 * silent: the pages render, they are just quietly wrong.
 *
 * The cost is nil. There is no database to hit and the whole fixture set is a
 * few objects, so per-request rendering is cheaper here than the caching would
 * be worth.
 */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'BTS platform demo',
  description:
    'A working demonstration of the Bitcoin Treasury Solutions operations platform, running on invented data.',
  // Decision 4: BTS-branded but not indexed. The demo is for people who were
  // sent the link, not for search.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <DemoRepositoryProvider>
          <div className={styles.shell}>
            <Nav />
            <div className={styles.main}>
              <DisclosureBanner />
              <main className={styles.content}>{children}</main>
            </div>
          </div>
        </DemoRepositoryProvider>
      </body>
    </html>
  );
}
