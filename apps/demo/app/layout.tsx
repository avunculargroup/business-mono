// Tokens first: globals.css and every *.module.css consume them. Same import
// order as apps/web — the demo is the platform's design system, not a copy.
import '@platform/ui/tokens.css';
import './globals.css';
import type { Metadata, Viewport } from 'next';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import { DisclosureBanner } from '@/components/DisclosureBanner';
import { Nav } from '@/components/Nav';
import { DemoRepositoryProvider } from '@/providers/DemoRepositoryProvider';
import { AnnotationProvider } from '@/providers/AnnotationProvider';
import { RouteAnnotations } from '@/components/RouteAnnotations';
import { ViewToggle } from '@/components/ViewToggle';
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

/**
 * Fonts are self-hosted, not linked from Google.
 *
 * `apps/web` links the CDN stylesheet, and copying that here was the obvious
 * thing to do — but it made the demo's only external request, and a stylesheet
 * in `<head>` gates `DOMContentLoaded`. On a machine that cannot reach
 * fonts.googleapis.com the page was slow to become interactive, not merely
 * unstyled, which quietly contradicts the claim this app is built around.
 *
 * `next/font` downloads the faces at build time and serves them from the
 * demo's own origin, so the running app makes no external request at all.
 * `display: 'swap'` keeps the fallback stacks in `tokens.css` doing their job
 * while a face is still arriving.
 *
 * The divergence from `apps/web` is deliberate: that app is internal and
 * authed, and nobody is evaluating whether it works with the network down.
 */
const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
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
  title: 'BTS platform demo',
  description:
    'A working demonstration of the Bitcoin Treasury Solutions operations platform, running on invented data.',
  // Decision 4: BTS-branded but not indexed. The demo is for people who were
  // sent the link, not for search.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body>
        <DemoRepositoryProvider>
          <AnnotationProvider>
            <div className={styles.shell}>
              <Nav />
              <div className={styles.main}>
                <DisclosureBanner />
                <div className={styles.chrome}>
                  <ViewToggle />
                </div>
                <main className={styles.content}>{children}</main>
              </div>
            </div>
            {/* Outside the shell: the overlay is viewport-fixed and must not be
                inside anything that establishes a containing block for it. */}
            <RouteAnnotations />
          </AnnotationProvider>
        </DemoRepositoryProvider>
      </body>
    </html>
  );
}
