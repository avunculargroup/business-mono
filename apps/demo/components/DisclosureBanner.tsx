import { Info } from 'lucide-react';
import styles from './DisclosureBanner.module.css';

/**
 * Present on every route, in the chrome rather than the footer.
 *
 * The demo shows a real internal platform running on invented data, and saying
 * so plainly is both the honest thing and the interesting thing — a reader who
 * knows the data is staged reads the surfaces as architecture rather than as
 * screenshots.
 */
export function DisclosureBanner() {
  return (
    <div className={styles.banner} role="note">
      <Info size={16} strokeWidth={1.5} className={styles.icon} aria-hidden />
      <p className={styles.text}>
        <strong>Demo.</strong> This is the real BTS operations platform running on invented
        data. Nothing here is a client, a holding, or advice, and every action that would
        write is disabled.
      </p>
    </div>
  );
}
