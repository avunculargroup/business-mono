import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Lockup } from '@/components/Lockup';
import { Markdown } from '@/components/Markdown';
import { acknowledgeDisclosure } from '@/app/actions/disclosure';
import { getClientRepositories, readContext } from '@/lib/repositories';
import styles from './disclosure.module.css';

export const metadata: Metadata = { title: 'Before you start' };

/**
 * The blocking gate.
 *
 * Outside the authenticated shell on purpose: there is no nav, because there is
 * nowhere to go. A gate with the rest of the app visible around it is a gate
 * people click through.
 *
 * The document comes from `compliance_documents` rather than from a constant,
 * so a new FSG version re-triggers this for everyone without a deploy — the
 * acknowledgement is recorded against a version, and bumping the version means
 * nobody has acknowledged the current one yet.
 */
export default async function DisclosurePage() {
  const repositories = await getClientRepositories();
  if (!repositories) redirect('/login');

  const ctx = readContext();
  const fsg = await repositories.compliance.activeDocument(ctx, 'fsg');

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <Lockup variant="gold-rule" />
        </header>

        {fsg === null ? (
          /* Absence is a fact, and this one is load-bearing. No active FSG
             means nobody can pass the gate, which is correct rather than
             broken — but it must say which it is, because a subscriber staring
             at a blank page cannot tell a compliance state from an outage. */
          <section className={styles.unavailable}>
            <h1>The disclosure document is not available</h1>
            <p>
              Minute cannot be opened until the Financial Services Guide has been published.
              This is a state on our side, not a problem with your account, and nobody can use
              the service until it is resolved.
            </p>
            <p>
              Please contact Bitcoin Treasury Solutions. If you were given a start date, it has
              not been met.
            </p>
          </section>
        ) : (
          <>
            <section className={styles.intro}>
              <h1>Before you start</h1>
              <p>
                Minute provides general information only. Please read the Financial Services
                Guide below. You will be asked to confirm that you have, and we record that
                confirmation against the version you were shown.
              </p>
            </section>

            <section className={styles.document} aria-label={fsg.title}>
              <div className={styles.documentMeta}>
                <span className={styles.documentTitle}>{fsg.title}</span>
                <span className={styles.version}>
                  Version <span className="mono">{fsg.version}</span>
                  {fsg.effectiveFrom ? (
                    <>
                      {' · effective '}
                      <span className="mono">{fsg.effectiveFrom}</span>
                    </>
                  ) : null}
                </span>
              </div>
              <Markdown>{fsg.body}</Markdown>
            </section>

            <form action={acknowledgeDisclosure} className={styles.form}>
              <input type="hidden" name="documentId" value={fsg.id} />
              <input type="hidden" name="documentVersion" value={fsg.version} />
              <button type="submit" className={styles.submit}>
                I have read the Financial Services Guide
              </button>
              <p className={styles.note}>
                We record the date, the version shown above, and the network address this
                confirmation came from.
              </p>
            </form>
          </>
        )}

        <footer className={styles.footer}>
          <a href="/logout" className={styles.exit}>
            Sign out instead
          </a>
        </footer>
      </div>
    </div>
  );
}
