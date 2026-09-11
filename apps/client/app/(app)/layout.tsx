import { Nav } from '@/components/Nav';
import { InformationNotice } from '@/components/InformationNotice';
import styles from './shell.module.css';

/**
 * The authenticated shell.
 *
 * The information-only notice lives here and nowhere else. Rule 3: a notice
 * added per route is a notice eventually forgotten on a route, so adding a
 * ninth route cannot omit it — there is nothing to remember to add.
 *
 * Everything inside this group is already past both gates. `middleware.ts`
 * redirects an unauthenticated or un-acknowledged session before it reaches
 * here, and every repository read rejects one independently, so this layout
 * does no checking of its own.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <Nav />
      <main className={styles.content}>{children}</main>
      <InformationNotice />
    </div>
  );
}
