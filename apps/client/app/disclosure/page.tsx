import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Lockup } from '@/components/Lockup';
import { Markdown } from '@/components/Markdown';
import { acknowledgeDisclosure } from '@/app/actions/disclosure';
import { resolveDocument } from '@platform/shared';
import { getClientRepositories, readContext } from '@/lib/repositories';
import styles from './disclosure.module.css';

export const metadata: Metadata = { title: 'Before you start' };

/**
 * The blocking gate. It serves the **Service Statement**.
 *
 * Not a Financial Services Guide. No FSG is required — BTS does not give
 * financial advice and holds no AFS authorisation — and publishing one would
 * wrongly imply an authorisation it has never held. What this is instead is a
 * plain statement of what the service is and is not, and it is the artefact
 * that evidences that position if anyone ever asks.
 *
 * Outside the authenticated shell on purpose: there is no nav, because there is
 * nowhere to go. A gate with the rest of the app visible around it is a gate
 * people click through.
 *
 * The document comes from `compliance_documents` rather than from a constant,
 * so a new version re-triggers this for everyone without a deploy — the
 * acknowledgement is recorded against a version, and bumping the version means
 * nobody has acknowledged the current one yet.
 */
export default async function DisclosurePage() {
  const repositories = await getClientRepositories();
  if (!repositories) redirect('/login');

  const ctx = readContext();
  const [statement, profile] = await Promise.all([
    repositories.compliance.activeDocument(ctx, 'service_statement'),
    repositories.compliance.profile(ctx),
  ]);

  // The statement is stored with {{variables}} and resolved here from
  // company_profile. A half-resolved document looks finished and is not, so
  // `resolveDocument` returns nothing at all rather than a body with
  // "ABN {{bts_abn}}" in it, and the page treats that as not-ready.
  const resolved = statement
    ? resolveDocument(statement.body, {
        profile: profile ?? {},
        version: statement.version,
        date: statement.effectiveFrom ?? new Date().toISOString().slice(0, 10),
        manual: {
          bts_privacy_policy_url: process.env['NEXT_PUBLIC_PRIVACY_POLICY_URL'] ?? '',
        },
      })
    : null;

  const ready = resolved !== null && resolved.missing.length === 0;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <header className={styles.header}>
          <Lockup variant="gold-rule" />
        </header>

        {statement === null || !ready ? (
          /* Absence is a fact, and this one is load-bearing. No active Service
             Statement means nobody can pass the gate, which is correct rather
             than broken — but it must say which it is, because a subscriber
             staring at a blank page cannot tell a deliberate state from an
             outage. */
          <section className={styles.unavailable}>
            <h1>The Service Statement is not available</h1>
            <p>
              Minute cannot be opened until the Service Statement has been published. This is a
              state on our side, not a problem with your account, and nobody can use the
              service until it is resolved.
            </p>
            <p>
              Please contact Bitcoin Treasury Solutions. If you were given a start date, it has
              not been met.
            </p>
            {resolved && resolved.missing.length > 0 ? (
              /* Only a founder sees this in practice — a subscriber cannot get
                 here before the statement is activated. It names what is
                 missing because "not available" with no detail sends someone
                 hunting through a table. */
              <p className={styles.note}>
                The statement is published but not fully filled in. Missing from the company
                profile: <span className="mono">{resolved.missing.join(', ')}</span>.
              </p>
            ) : null}
          </section>
        ) : (
          <>
            <section className={styles.intro}>
              <h1>Before you start</h1>
              <p>
                Minute provides factual information and does not provide financial advice.
                Please read the Service Statement below — it sets out what the service is and
                what it is not. You will be asked to confirm that you have read it, and we
                record that confirmation against the version you were shown.
              </p>
            </section>

            <section className={styles.document} aria-label={statement.title}>
              <div className={styles.documentMeta}>
                <span className={styles.documentTitle}>{statement.title}</span>
                <span className={styles.version}>
                  Version <span className="mono">{statement.version}</span>
                  {statement.effectiveFrom ? (
                    <>
                      {' · effective '}
                      <span className="mono">{statement.effectiveFrom}</span>
                    </>
                  ) : null}
                </span>
              </div>
              <Markdown>{resolved!.body}</Markdown>
            </section>

            <form action={acknowledgeDisclosure} className={styles.form}>
              <input type="hidden" name="documentId" value={statement.id} />
              <input type="hidden" name="documentVersion" value={statement.version} />
              <button type="submit" className={styles.submit}>
                I have read the Service Statement
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
