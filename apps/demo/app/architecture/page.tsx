import { PRINCIPLES } from '@/lib/annotations';
import { Page } from '@/components/Page';
import styles from '@/components/Page.module.css';

export const metadata = { title: 'Architecture — BTS platform demo' };

export default function ArchitecturePage() {
  return (
    <Page
      title="Architecture"
      lede="Seven decisions that shaped this platform, and what each one costs. The annotations throughout the demo link here; this is the longer answer for anyone who read a marker and wanted the reasoning rather than the claim."
    >
      {PRINCIPLES.map((principle) => (
        // The id is the anchor annotations link to, so a marker's "read the
        // reasoning" lands on the right section rather than the top of the page.
        <section key={principle.key} id={principle.key} className={styles.principle}>
          <h2 className={styles.principleTitle}>{principle.title}</h2>
          {principle.body.map((paragraph) => (
            <p key={paragraph.slice(0, 32)} className={styles.principleBody}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </Page>
  );
}
